#!/usr/bin/env bash
set -euo pipefail

# Export-only fix to the client runtime's log4j-core 2.0-beta9: ThrowableProxy.loadClass
# treats a LinkageError like a missing class. While printing an exception, log4j loads each
# stack frame's class by name through the loader of the frame before it; after a frame on the
# system class path (RFB, Guava's event bus) that is the system loader, which defines a second
# copy of a GT or addon class, cannot see Minecraft, and throws NoClassDefFoundError
# (net/minecraft/inventory/ISidedInventory). beta9 catches only Exception there, so logging
# any such exception kills the client; later log4j releases catch LinkageError the same way.

runtime_dir="${1:?Usage: install-log4j-linkage-fix.sh <runtime-dir> <work-dir>}"
work_dir="${2:?Usage: install-log4j-linkage-fix.sh <runtime-dir> <work-dir>}"

asm_jar="$(find "$runtime_dir" -type f -name 'lwjgl3ify-*-forgePatches.jar' | sort | head -n 1)"
if [[ -z "$asm_jar" ]]; then
  echo "No ASM on the client runtime class path; cannot patch log4j." >&2
  exit 1
fi

src_dir="$work_dir/log4j-linkage-fix-src"
classes_dir="$work_dir/log4j-linkage-fix-classes"
rm -rf "$src_dir" "$classes_dir"
mkdir -p "$src_dir" "$classes_dir"

cat > "$src_dir/Log4jLinkageFix.java" <<'EOF'
import java.net.URI;
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.HashMap;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Label;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodNode;

public class Log4jLinkageFix {
    private static final String ENTRY = "org/apache/logging/log4j/core/impl/ThrowableProxy.class";
    private static final String OWNER = "org/apache/logging/log4j/core/impl/ThrowableProxy";
    private static final String NAME = "loadClass";
    private static final String DESC = "(Ljava/lang/ClassLoader;Ljava/lang/String;)Ljava/lang/Class;";
    private static final String RENAMED = "loadClass$withoutLinkageGuard";

    public static void main(String[] args) throws Exception {
        for (String jar : args) {
            URI uri = URI.create("jar:" + Paths.get(jar).toUri());
            try (FileSystem fs = FileSystems.newFileSystem(uri, new HashMap<String, Object>())) {
                Path entry = fs.getPath(ENTRY);
                if (!Files.exists(entry)) {
                    System.out.println(jar + ": no ThrowableProxy, left unchanged.");
                    continue;
                }
                byte[] patched = patch(Files.readAllBytes(entry));
                if (patched == null) {
                    System.out.println(jar + ": already patched.");
                    continue;
                }
                Files.write(entry, patched, StandardOpenOption.TRUNCATE_EXISTING);
                System.out.println(jar + ": ThrowableProxy.loadClass now returns null on a LinkageError.");
            }
        }
    }

    static byte[] patch(byte[] bytes) {
        ClassNode node = new ClassNode();
        new ClassReader(bytes).accept(node, 0);
        MethodNode original = null;
        for (MethodNode method : node.methods) {
            if (RENAMED.equals(method.name)) {
                return null;
            }
            if (NAME.equals(method.name) && DESC.equals(method.desc)) {
                original = method;
            }
        }
        if (original == null) {
            throw new IllegalStateException("ThrowableProxy.loadClass" + DESC + " not found.");
        }
        original.name = RENAMED;
        int access = original.access;

        MethodNode mv = new MethodNode(Opcodes.ASM5, access, NAME, DESC, original.signature, null);
        Label start = new Label();
        Label end = new Label();
        Label handler = new Label();
        mv.visitCode();
        mv.visitTryCatchBlock(start, end, handler, "java/lang/LinkageError");
        mv.visitLabel(start);
        mv.visitVarInsn(Opcodes.ALOAD, 0);
        mv.visitVarInsn(Opcodes.ALOAD, 1);
        mv.visitVarInsn(Opcodes.ALOAD, 2);
        mv.visitMethodInsn(Opcodes.INVOKESPECIAL, OWNER, RENAMED, DESC, false);
        mv.visitLabel(end);
        mv.visitInsn(Opcodes.ARETURN);
        mv.visitLabel(handler);
        mv.visitFrame(Opcodes.F_FULL, 3, new Object[] { OWNER, "java/lang/ClassLoader", "java/lang/String" }, 1,
            new Object[] { "java/lang/LinkageError" });
        mv.visitInsn(Opcodes.POP);
        mv.visitInsn(Opcodes.ACONST_NULL);
        mv.visitInsn(Opcodes.ARETURN);
        mv.visitMaxs(3, 3);
        mv.visitEnd();
        node.methods.add(mv);

        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        node.accept(writer);
        return writer.toByteArray();
    }
}
EOF

javac -source 8 -target 8 -Xlint:-options -cp "$asm_jar" -d "$classes_dir" "$src_dir/Log4jLinkageFix.java"
mapfile -t log4j_jars < <(find "$runtime_dir" -type f -name 'log4j-core-*.jar' | sort)
if [[ "${#log4j_jars[@]}" -eq 0 ]]; then
  echo "No log4j-core jar in $runtime_dir; nothing to patch."
  exit 0
fi
java -cp "$classes_dir:$asm_jar" Log4jLinkageFix "${log4j_jars[@]}"
