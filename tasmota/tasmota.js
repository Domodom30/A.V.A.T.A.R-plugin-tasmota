import * as path from 'node:path'
import fs from 'fs-extra'
import * as url from 'url'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

import * as tasmotaLib from './lib/tasmota.js'
const tasmotaAPI = await tasmotaLib.init()

import * as widgetLib from '../../../widgetLibrairy.js'
const Widget = await widgetLib.init()

// devices table
let periphInfo = [];
let tasmotaWindow;
let Locale; //language pak
let currentwidgetState;

const widgetFolder = path.resolve(__dirname, 'assets/widget')
const widgetImgFolder = path.resolve(__dirname, 'assets/images/widget')

export async function onClose(widgets) {

  if (Config.modules.tasmota.widget.display === true) {
    await Widget.initVar(
      path.resolve(__dirname, 'assets/widget'),
      path.resolve(__dirname, 'assets/images/widget'),
      path.resolve(__dirname, 'lib/tasmota.js'),
      Config.modules.tasmota
    )
    if (widgets) await Widget.saveWidgets(widgets)
  }
}

export async function init() {
  if (!(await Avatar.lang.addPluginPak('tasmota'))) {
    return error('tasmota: unable to load language pak files')
  }

  Locale = await Avatar.lang.getPak('tasmota', Config.language)
  if (!Locale) {
    return error(`tasmota: Unable to find the '${Config.language}' language pak.`)
  }

  const ipRange = Config.modules.tasmota.settings.ipRange
  const devices = await tasmotaAPI.getTasmotaDevices(ipRange)

  const rooms = await Avatar.APIFunctions.getPeriphRooms(devices)
  periphInfo = await Avatar.APIFunctions.classPeriphByRooms(rooms, devices)

}

export async function getWidgetsOnLoad() {
  if (!Config.modules.tasmota.settings.ipRange) {
    return
  }
  if (Config.modules.tasmota.widget.display === true) {
    await Widget.initVar(
      path.resolve(__dirname, 'assets/widget'),
      path.resolve(__dirname, 'assets/images/widget'),
      path.resolve(__dirname, 'lib/tasmota.js'),
      Config.modules.tasmota
    )
    let widgets = await Widget.getWidgets()
    return { plugin: 'tasmota', widgets: widgets, Config: Config.modules.tasmota }
  }
}

export async function readyToShow() {
  const { active, username, password, ipRange } = Config.modules.tasmota.settings
  if (!ipRange) {
    openTasmotaWindow()
  }
  if (active && (!username || !password)) {
    openTasmotaWindow()
  }

  // If a backup file exists
  if (fs.existsSync(path.resolve(__dirname, 'assets', 'style.json'))) {
		let prop = fs.readJsonSync(path.resolve(__dirname, 'assets', 'style.json'), { throws: false });
		currentwidgetState = prop.start;
		if (currentwidgetState) openTasmotaWindow();
	} else 	
		currentwidgetState = false;
    Avatar.Interface.refreshWidgetInfo({plugin: 'tasmota', id: "555555"});
}

export async function getNewButtonState(arg) {
  return currentwidgetState === true ? "Off" : "On";
}

export async function getPeriphInfo() {
  const ipRange = Config.modules.tasmota.settings.ipRange
  const devices = await tasmotaAPI.getTasmotaDevices(ipRange)

  const rooms = await Avatar.APIFunctions.getPeriphRooms(devices)
  periphInfo = await Avatar.APIFunctions.classPeriphByRooms(rooms, devices)
  
  periphInfo.push({
    Buttons: [
      {
        name: Locale.get("label.settings"),
        value_type: 'button',
        usage_name: 'Button',
        periph_id: '555555',
        notes: Locale.get("label.title")
      }
    ]
  })
  
  return periphInfo
}

export async function widgetAction(even) {
  if (even.type !== 'button') {

    await Widget.initVar(widgetFolder, widgetImgFolder, null, Config.modules.tasmota)

    return await Widget.widgetAction(even, periphInfo)
  } else {

    currentwidgetState = even.value.action === 'On' ? true : false;
    if (!tasmotaWindow && even.value.action === 'On') return openTasmotaWindow();
      if (tasmotaWindow && even.value.action === 'Off') tasmotaWindow.destroy();
  }
}

export async function action(data, callback) {
  try {
    // Table of actions
    const tblActions = {}

    info('tasmota: ', data.action.command, L.get('plugin.from'), data.client)

    tblActions[data.action.command]()
  } catch (err) {
    if (data.client) Avatar.Speech.end(data.client)
    if (err.message) error(err.message)
  }

  callback()
}

const openTasmotaWindow = async () => {
  if (tasmotaWindow) return tasmotaWindow.show()

  let style = {
    parent: Avatar.Interface.mainWindow(),
    frame: false,
    movable: true,
    resizable: true,
    minimizable: false,
    alwaysOnTop: false,
    show: false,
    width: 420,
    height: 470,
    opacity: 1,
    icon: path.resolve(__dirname, 'assets', 'images', 'tasmota.png'),
    webPreferences: {
      preload: path.resolve(__dirname, 'html', 'settings-preload.js')
    },
    title: 'Paramètres Tasmota'
  }

  if (fs.existsSync(path.resolve(__dirname, 'assets', 'style.json'))) {
    let prop = fs.readJsonSync(path.resolve(__dirname, 'assets', 'style.json'), { throws: false });
    if (prop) {
        style.x = prop.x;
        style.y = prop.y;
    }
}

  tasmotaWindow = await Avatar.Interface.BrowserWindow(style, path.resolve(__dirname, 'html', 'settings.html'), false)

  tasmotaWindow.once('ready-to-show', () => {
    tasmotaWindow.show()
    tasmotaWindow.webContents.send('onInit-tasmota', Config.modules.tasmota)
    if (Config.modules.tasmota.devTools) tasmotaWindow.webContents.openDevTools()
  })

  Avatar.Interface.ipcMain().on('tasmota-quit', () => {
    tasmotaWindow.destroy();
    Avatar.Interface.refreshWidgetInfo({plugin: 'tasmota', id: "555555"});
  })

  // Save Configuration
  Avatar.Interface.ipcMain().handle('tasmota-config', async (_event, arg) => {
    return saveConfig(arg)
  })

  // returns the localized message defined in arg
  Avatar.Interface.ipcMain().handle('tasmota-msg', async (_event, arg) => {
    return Locale.get(arg)
  })

  tasmotaWindow.on('closed', () => {
    currentwidgetState = false;
    Avatar.Interface.ipcMain().removeHandler('tasmota-msg')
    Avatar.Interface.ipcMain().removeHandler('tasmota-config')
    Avatar.Interface.ipcMain().removeAllListeners('tasmota-quit')
    tasmotaWindow = null
  })
}

const saveConfig = configValue => {
  try {

    const configPath = path.resolve(__dirname, 'tasmota.prop')

    let configProp = {}
    if (fs.existsSync(configPath)) {
      try {
        const fileContent = fs.readFileSync(configPath, 'utf8')
        configProp = JSON.parse(fileContent)
      } catch (parseError) {
        return error('Erreur lors de la lecture du fichier :', parseError.message)
      }
    }

    configProp.modules = configProp.modules ?? {}
    configProp.modules.tasmota = configProp.modules.tasmota ?? {}
    configProp.modules.tasmota.settings = configProp.modules.tasmota.settings ?? {}

    configProp.modules.tasmota.settings = {
      ...configProp.modules.tasmota.settings,
      active: configValue.authActive,
      username: configValue.username,
      password: configValue.password,
      ipRange: configValue.ipRange
    }

    fs.writeFileSync(configPath, JSON.stringify(configProp, null, 2))

    return true
  } catch (error) {
    error('Erreur lors de la sauvegarde :', error.message)
    return false
  }
}
