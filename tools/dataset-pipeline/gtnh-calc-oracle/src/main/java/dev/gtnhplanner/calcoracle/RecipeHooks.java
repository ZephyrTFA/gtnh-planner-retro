package dev.gtnhplanner.calcoracle;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;

/**
 * Static no-arg methods (package.Class.method, comma separated in
 * gtnh.oracle.recipeHooks) that an addon runs only once a world loads. The export
 * starts from the main menu, so without them those recipes never reach the maps.
 * Hooks come from the addon set; a hook that is missing or throws stops the run,
 * since the dataset would silently lack its recipes.
 */
final class RecipeHooks {

    private RecipeHooks() {}

    static void runAll() throws Exception {
        String spec = System.getProperty("gtnh.oracle.recipeHooks", "").trim();
        if (spec.isEmpty()) {
            return;
        }
        for (String raw : spec.split(",")) {
            String hook = raw.trim();
            if (hook.isEmpty()) {
                continue;
            }
            int dot = hook.lastIndexOf('.');
            if (dot <= 0) {
                throw new IllegalArgumentException("Recipe hook " + hook + " must name package.Class.method.");
            }
            Class<?> owner = Class.forName(hook.substring(0, dot));
            Method method = owner.getMethod(hook.substring(dot + 1));
            if (!Modifier.isStatic(method.getModifiers())) {
                throw new IllegalArgumentException("Recipe hook " + hook + " is not static.");
            }
            GtnhCalcOracleMod.LOG.info("GTNH calculation oracle running recipe hook {}.", hook);
            method.invoke(null);
        }
    }
}
