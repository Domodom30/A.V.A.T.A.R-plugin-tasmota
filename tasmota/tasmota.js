import * as path from 'node:path'
import fs from 'fs-extra'
import * as url from 'url'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

import * as tasmotaLib from './lib/tasmota.js'
const tasmotaAPI = await tasmotaLib.init()

import * as widgetLib from '../../../widgetLibrairy.js'
const Widget = await widgetLib.init()

// devices table
let periphInfo = []
let tasmotaWindow
let Locale //language pak

const widgetFolder = path.resolve(__dirname, 'assets/widget')
const widgetImgFolder = path.resolve(__dirname, 'assets/images/widget')

export async function onClose(widgets) {
  // Save widget positions
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
  if(!ipRange) {
    openTasmotaWindow()
  }
  if (active && (!username || !password)) {
    openTasmotaWindow()
  }
}

export async function getNewButtonState(arg) {
  return
}

export async function getPeriphInfo() {
  const ipRange = Config.modules.tasmota.settings.ipRange
  const devices = await tasmotaAPI.getTasmotaDevices(ipRange)

  const rooms = await Avatar.APIFunctions.getPeriphRooms(devices)
  periphInfo = await Avatar.APIFunctions.classPeriphByRooms(rooms, devices)

  return periphInfo
}

export async function widgetAction(even) {
  if (even.type !== 'button') {
    // Action for 'List of values' and 'float value' types
    await Widget.initVar(widgetFolder, widgetImgFolder, null, Config.modules.tasmota)

    return await Widget.widgetAction(even, periphInfo)
  } else {
    // Action for 'button' type

    // Do stuff
    infoConsole(even.value)
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
    height: 255,
    opacity: 1,
    icon: path.resolve(__dirname, 'assets', 'images', 'tasmota.png'),
    webPreferences: {
      preload: path.resolve(__dirname, 'html', 'settings-preload.js')
    },
    title: 'Paramètres Tasmota'
  }

  tasmotaWindow = await Avatar.Interface.BrowserWindow(style, path.resolve(__dirname, 'html', 'settings.html'), false)

  tasmotaWindow.once('ready-to-show', () => {
    tasmotaWindow.show()
    tasmotaWindow.webContents.send('onInit-tasmota', Config.modules.tasmota)
    if (Config.modules.tasmota.devTools) tasmotaWindow.webContents.openDevTools()
  })

  Avatar.Interface.ipcMain().on('tasmota-quit', () => {
    tasmotaWindow.destroy()
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
    Avatar.Interface.ipcMain().removeHandler('tasmota-msg')
    Avatar.Interface.ipcMain().removeHandler('tasmota-config')
    Avatar.Interface.ipcMain().removeAllListeners('tasmota-quit')
    tasmotaWindow = null
  })
}

const saveConfig = configValue => {
  try {
    // Déterminer le chemin absolu vers le fichier de configuration
    const configPath = path.resolve(__dirname, 'tasmota.prop');
    
    // Lire la configuration existante ou créer un objet vide
    let configProp = {};
    if (fs.existsSync(configPath)) {
      try {
        const fileContent = fs.readFileSync(configPath, 'utf8');
        configProp = JSON.parse(fileContent);
      } catch (parseError) {
        console.error("Erreur lors de la lecture du fichier :", parseError.message);
        // Continuer avec un objet vide plutôt que d'échouer
      }
    }
    
    // Utiliser l'opérateur de coalescence nulle pour initialiser la structure
    configProp.modules = configProp.modules ?? {};
    configProp.modules.tasmota = configProp.modules.tasmota ?? {};
    configProp.modules.tasmota.settings = configProp.modules.tasmota.settings ?? {};
    
    // Mettre à jour les paramètres
    configProp.modules.tasmota.settings = {
      ...configProp.modules.tasmota.settings,
      active: configValue.authActive,
      username: configValue.username,
      password: configValue.password,
      ipRange: configValue.ipRange
    };
    
    // Écrire la configuration mise à jour dans le fichier
    fs.writeFileSync(configPath, JSON.stringify(configProp, null, 2));
    
    // Retourner true pour indiquer le succès
    return true;
  } catch (error) {
    error("Erreur lors de la sauvegarde :", error.message);
    // Retourner false en cas d'erreur
    return false;
  }
};
