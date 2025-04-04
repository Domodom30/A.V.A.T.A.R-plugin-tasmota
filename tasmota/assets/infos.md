# Tasmota v1.3.0
<div style="text-align: left; margin: 10px 0">
<img src="../../core/plugins/tasmota/assets/images/tasmota.png" width="40"/></div>

### ✨ Feature
The Tasmota Widget plugin simply allows you to control and display your Tasmota devices with [A.V.A.T.A.R](https://github.com/Avatar-Home-Automation).

### ✨ New Features
- Added the ability to make Avatar speak when an action is performed on a Tasmota widget.
- Server port adjustment for widget updates.
- Added settings icon on clients.

## Configuration
1. A configuration window opens 
<div style="text-align: center;">
<img src="../../core/plugins/tasmota/assets/images/docs/window.png" width="180"/></div>

2. If your Sonoff modules require a login and password, fill in the authentication section.
   
### After installing the plugin and when opening the Avatar server
1. The plugin will scan your modules present on the network.
2. Based on the module name and room name entered in your modules, the plugin will automatically update the rules in the prop file.
3. When transferring the plugin to clients, the widgets associated with the client name will be visible.
4. On the server, all widgets can be accessible.

<div style="text-align: center;">
<img src="../../core/plugins/tasmota/assets/images/docs/ws.png" width="350"/><img src="../../core/plugins/tasmota/assets/images/docs/ws-1.png" width="350"/></div>