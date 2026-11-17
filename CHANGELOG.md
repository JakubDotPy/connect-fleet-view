# Changelog

What an operator sees change when they upgrade this module, newest release
first. `version:` in `module.yaml` is the newest heading below.

Write the entry in the same change as the code. One bullet per behaviour a
person outside this repository can observe: a route, a setting, a screen, a
refusal. Name the route and the setting key, never a function or a file.

## 0.1.0 - 2026-11-17

### Added

- Fleet View: a page of its own, with an entry in the sidebar.
- Fleet View shows racks on a floor plan, each printer in its slot with its state.
- A selected rack, shelf or printer takes batch commands: pause, resume, stop, set ready, preheat, cool down, home.
- Edit layout arranges racks, names shelves and slots, and places printers by drag or press, on the floor or in a rack.
- Edit layout imports and exports the layout as YAML.
- Edit layout places computer and service placeholders on slots to keep them free of printers.
- `GET /layout` and `PUT /layout` keep one floor plan shared by everyone on the server; a save over a newer version is
  refused with `LAYOUT_CHANGED`.
- The module asks for a data directory, where it keeps `layout.json`.
- The dashboard card Rack shows one rack from the front and takes batch commands for it, a shelf or a printer.
- Double-clicking a rack on the floor opens it.
