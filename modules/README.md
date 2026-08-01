# FamilyStar Business Modules

Each business module is an independent workspace package with its own manifest, public entry point, and build boundary. The root package owns the compile-time plugin list and the read-only module-toggle placeholders used by the future settings page.

The MVP always loads the modules in dependency order: tasks, check-in, points, levels, then rewards. Runtime module toggling and dynamic imports are reserved for Phase 2.
