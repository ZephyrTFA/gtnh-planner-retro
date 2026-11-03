#!/usr/bin/env bash
set -euo pipefail

# Export-only coremod: GregTech's GTBlockEventTracker.enqueue returns at once when the
# tile has no world. Addon multiblocks (GT Not Leisure) build their tooltips by dry-running
# the structure check on the registry prototype, which has no world, and a check that sends a
# block event then throws inside Guava's map. Logging that exception makes log4j load GT
# classes through the system class loader, which cannot see Minecraft, and the client dies
# while NEI loads. A null world never reaches a real block event, so nothing else changes.

instance_root="${1:?Usage: install-gt-null-world-shim.sh <instance-root> <runtime-dir> <work-dir>}"
runtime_dir="${2:?Usage: install-gt-null-world-shim.sh <instance-root> <runtime-dir> <work-dir>}"
work_dir="${3:?Usage: install-gt-null-world-shim.sh <instance-root> <runtime-dir> <work-dir>}"

mods_dir="$instance_root/mods"
shim_jar="$mods_dir/000-gt-null-world-shim.jar"

src_dir="$work_dir/gt-null-world-shim-src"
classes_dir="$work_dir/gt-null-world-shim-classes"
package_dir="dev/gtnhplanner/exportshim"
rm -rf "$src_dir" "$classes_dir"
mkdir -p "$src_dir/$package_dir" "$classes_dir/META-INF"

cat > "$src_dir/$package_dir/NullWorldShimPlugin.java" <<'EOF'
package dev.gtnhplanner.exportshim;

import java.util.Map;

import cpw.mods.fml.relauncher.IFMLLoadingPlugin;

@IFMLLoadingPlugin.Name("GTNH Planner export null-world shim")
public class NullWorldShimPlugin implements IFMLLoadingPlugin {
    @Override
    public String[] getASMTransformerClass() {
        return new String[] { NullWorldBlockEventTransformer.class.getName() };
    }

    @Override
    public String getModContainerClass() {
        return null;
    }

    @Override
    public String getSetupClass() {
        return null;
    }

    @Override
    public void injectData(Map<String, Object> data) {}

    @Override
    public String getAccessTransformerClass() {
        return null;
    }
}
EOF

cat > "$src_dir/$package_dir/NullWorldBlockEventTransformer.java" <<'EOF'
package dev.gtnhplanner.exportshim;

import net.minecraft.launchwrapper.IClassTransformer;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FrameNode;
import org.objectweb.asm.tree.InsnList;
import org.objectweb.asm.tree.InsnNode;
import org.objectweb.asm.tree.JumpInsnNode;
import org.objectweb.asm.tree.LabelNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.VarInsnNode;

public class NullWorldBlockEventTransformer implements IClassTransformer {
    private static final String TARGET = "gregtech.common.data.GTBlockEventTracker";

    @Override
    public byte[] transform(String name, String transformedName, byte[] basicClass) {
        if (basicClass == null || !TARGET.equals(transformedName)) {
            return basicClass;
        }
        ClassNode node = new ClassNode();
        new ClassReader(basicClass).accept(node, 0);
        boolean patched = false;
        for (MethodNode method : node.methods) {
            // enqueue(World, int x, int y, int z, byte id, byte value)
            if (!"enqueue".equals(method.name) || (method.access & Opcodes.ACC_STATIC) == 0
                || !method.desc.endsWith("IIIBB)V")) {
                continue;
            }
            LabelNode proceed = new LabelNode();
            InsnList guard = new InsnList();
            guard.add(new VarInsnNode(Opcodes.ALOAD, 0));
            guard.add(new JumpInsnNode(Opcodes.IFNONNULL, proceed));
            guard.add(new InsnNode(Opcodes.RETURN));
            guard.add(proceed);
            guard.add(new FrameNode(Opcodes.F_SAME, 0, null, 0, null));
            method.instructions.insert(guard);
            patched = true;
        }
        if (!patched) {
            System.out.println("[GTNH Planner export shim] " + TARGET + ".enqueue not found; left unchanged.");
            return basicClass;
        }
        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        node.accept(writer);
        System.out.println("[GTNH Planner export shim] " + TARGET + ".enqueue now skips a null world.");
        return writer.toByteArray();
    }
}
EOF

classpath="$(
  {
    find "$mods_dir" "$runtime_dir" "$instance_root/libraries" -type f -name '*.jar' ! -name "$(basename "$shim_jar")" 2>/dev/null || true
  } | sort | paste -sd ':' -
)"
if [[ -z "$classpath" ]]; then
  echo "Could not build classpath for the GT null-world shim." >&2
  exit 1
fi

javac -source 8 -target 8 -Xlint:-options -cp "$classpath" -d "$classes_dir" $(find "$src_dir" -name '*.java' | sort)
cat > "$classes_dir/META-INF/MANIFEST.MF" <<'EOF'
Manifest-Version: 1.0
FMLCorePlugin: dev.gtnhplanner.exportshim.NullWorldShimPlugin
FMLCorePluginContainsFMLMod: false
EOF
jar cfm "$shim_jar" "$classes_dir/META-INF/MANIFEST.MF" -C "$classes_dir" dev
echo "Installed GT null-world shim: $shim_jar"
