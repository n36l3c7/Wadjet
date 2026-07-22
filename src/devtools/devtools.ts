/**
 * DevTools page: registers the "Wadjet" panel.
 *
 * @module
 */
// The DevTools tab icon renders small, so use the compact build.
void browser.devtools.panels.create('Wadjet', 'icons/wadjet-compact.svg', 'devtools/panel.html');
