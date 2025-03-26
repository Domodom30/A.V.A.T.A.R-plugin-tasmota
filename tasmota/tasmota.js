import * as path from 'node:path';
import fs from 'fs-extra';
import axios from 'axios';
import * as url from 'url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

import * as tasmotaLib from './lib/tasmota.js';
const tasmotaAPI = await tasmotaLib.init();

import * as widgetLib from '../../../widgetLibrairy.js';

const Widget = await widgetLib.init();

// devices table
let periphInfo = [];
let tasmotaWindow;
let Locale; //language pak
let currentwidgetState;

const widgetFolder = path.resolve(__dirname, 'assets/widget');
const widgetImgFolder = path.resolve(__dirname, 'assets/images/widget');
const apiTasmota = path.resolve(__dirname, './lib/tasmota.js');

export async function onClose(widgets) {
   if (Config.modules.tasmota.widget.display === true) {
      if (widgets) await Widget.saveWidgets(widgets);
   }
}

export async function init() {
   if (!(await Avatar.lang.addPluginPak('tasmota'))) {
      return error('tasmota: unable to load language pak files');
   }

   Locale = await Avatar.lang.getPak('tasmota', Config.language);
   if (!Locale) {
      return error(`tasmota: Unable to find the '${Config.language}' language pak.`);
   }

   tasmotaAPI.initVar(Config.modules.tasmota);
   tasmotaAPI.initLang(Config.language);

   await Widget.initVar(widgetFolder, widgetImgFolder, apiTasmota, Config.modules.tasmota);
   const devices = await tasmotaAPI.scanTasmotaDevices();
   const rooms = await Avatar.APIFunctions.getPeriphRooms(devices);

   await tasmotaAPI.updateConfigFile(devices);

   periphInfo = await Avatar.APIFunctions.classPeriphByRooms(rooms, devices);

   periphInfo.push({
      Buttons: [
         {
            name: Locale.get('label.settings'),
            value_type: 'button',
            usage_name: 'Button',
            periph_id: '555555',
            notes: Locale.get('label.title'),
         },
      ],
   });

   if (!Config.modules.tasmota.settings.serveur) {
      tasmotaAPI.getLocalIPv4();
   }
   return periphInfo;
}

export async function action(data, callback) {
   try {
      // Table of actions
      const tblActions = {
         set: () => {
            setTasmotaPeriph(data);
         },
         updateWidgetClient: () => {
            updateWidgetClient(data);
         },
         updateInfo: () => {
            updateWidgetClient(data);
         },
      };

      info('tasmota: ', data.action.command, L.get('plugin.from'), data.client || data.action.client);

      tblActions[data.action.command]();
   } catch (err) {
      if (data.client) Avatar.Speech.end(data.client);
      if (err.message) error(err.message);
   }

   callback();
}

export async function getWidgetsOnLoad() {
   // On charge les widgets au démarrage
   if (Config.modules.tasmota.widget.display === true) {
      let widgets = await Widget.getWidgets(widgetFolder);
      let secondWidgets = []; // On prépare un tableau pour stocker les bons widgets

      if (!Config.client) {
         return {
            plugin: 'tasmota',
            widgets: widgets,
            Config: Config.modules.tasmota,
         };
      } else {
         for (let i = 0; i < widgets.length; i++) {
            const id = widgets[i].id;

            try {
               let res = await tasmotaAPI.getDeviceDirectInfos(id);
               if (res && res.room_name === Config.client) {
                  secondWidgets.push(widgets[i]);
               }
            } catch (error) {
               console.error(`Erreur lors de la récupération des infos pour le widget ${id}`, error);
            }
         }
         return {
            plugin: 'tasmota',
            widgets: secondWidgets, // uniquement ceux filtrés
            Config: Config.modules.tasmota,
         };
      }
   }
}

export async function readyToShow() {
   const { active, username, password } = Config.modules.tasmota.settings;

   if (active && (!username || !password)) {
      openTasmotaWindow();
   }

   // If a backup file exists
   if (fs.existsSync(path.resolve(__dirname, 'assets', 'style.json'))) {
      let prop = fs.readJsonSync(path.resolve(__dirname, 'assets', 'style.json'), { throws: false });
      currentwidgetState = prop.start;
      if (currentwidgetState) openTasmotaWindow();
   } else currentwidgetState = false;
   Avatar.Interface.refreshWidgetInfo({ plugin: 'tasmota', id: '555555' });
}

export async function getNewButtonState(arg) {
   return currentwidgetState === true ? 'Off' : 'On';
}

export async function getPeriphInfo() {
   const devices = tasmotaAPI.getDeviceCache();
   const rooms = await Avatar.APIFunctions.getPeriphRooms(devices);
   periphInfo = await Avatar.APIFunctions.classPeriphByRooms(rooms, devices);

   periphInfo.push({
      Buttons: [
         {
            name: Locale.get('label.settings'),
            value_type: 'button',
            usage_name: 'Button',
            periph_id: '555555',
            notes: Locale.get('label.title'),
         },
      ],
   });

   return periphInfo;
}

export async function widgetAction(even) {
   if (even.type !== 'button') {
      const devices = tasmotaAPI.getDeviceCache();
      const rooms = await Avatar.APIFunctions.getPeriphRooms(devices);
      periphInfo = await Avatar.APIFunctions.classPeriphByRooms(rooms, devices);

      await Widget.initVar(widgetFolder, widgetImgFolder, apiTasmota, Config.modules.tasmota);

      if (!even.action) {
         even.action = {};
      }
      if (!Config.client) {
         even.action.client = 'Serveur';
      }
      even.action.remote = false;

      updateWidgets(even);

      return await Widget.widgetAction(even, periphInfo);
   } else {
      currentwidgetState = even.value.action === 'On' ? true : false;
      if (!tasmotaWindow && even.value.action === 'On') return openTasmotaWindow();
      if (tasmotaWindow && even.value.action === 'Off') tasmotaWindow.destroy();
      return null;
   }
}

const openTasmotaWindow = async () => {
   try {
      if (tasmotaWindow && !tasmotaWindow.isDestroyed() && even.value.action === 'Off') {
         tasmotaWindow.destroy();
      }

      const mainWindow = Avatar.Interface.mainWindow();
      const assetsPath = path.resolve(__dirname, 'assets');
      const htmlPath = path.resolve(__dirname, 'html');
      const styleFile = path.join(assetsPath, 'style.json');

      // Définition du style par défaut
      const style = {
         parent: mainWindow,
         frame: false,
         movable: true,
         resizable: true,
         minimizable: false,
         alwaysOnTop: false,
         show: false,
         width: 420,
         height: 460,
         opacity: 1,
         icon: path.join(assetsPath, 'images', 'tasmota.png'),
         webPreferences: {
            preload: path.join(htmlPath, 'settings-preload.js'),
         },
         title: 'Paramètres Tasmota',
      };

      // Si le fichier de style existe, on applique les coordonnées sauvegardées
      if (fs.existsSync(styleFile)) {
         const prop = fs.readJsonSync(styleFile, { throws: false });
         if (prop?.x != null && prop?.y != null) {
            style.x = prop.x;
            style.y = prop.y;
         }
      }

      // Création de la fenêtre
      tasmotaWindow = await Avatar.Interface.BrowserWindow(style, path.join(htmlPath, 'settings.html'), false);

      // Événement prêt à afficher
      tasmotaWindow.once('ready-to-show', () => {
         tasmotaWindow.show();

         tasmotaWindow.webContents.send('onInit-tasmota', Config.modules.tasmota);

         if (Config.modules.tasmota?.devTools) {
            tasmotaWindow.webContents.openDevTools({ mode: 'detach' });
         }
      });

      // Gestion des événements IPC
      const ipc = Avatar.Interface.ipcMain();

      const quitHandler = () => {
         tasmotaWindow?.destroy();
         Avatar.Interface.refreshWidgetInfo({ plugin: 'tasmota', id: '555555' });
      };

      const configHandler = async (_event, arg) => saveConfig(arg);
      const msgHandler = async (_event, arg) => Locale.get(arg);
      const configIP = async (_event) => {
         return tasmotaAPI.getLocalIPv4();
      };

      ipc.once('tasmota-quit', quitHandler);
      ipc.handle('tasmota-config', configHandler);
      ipc.handle('tasmota-localIP', configIP);
      ipc.handle('tasmota-msg', msgHandler);

      // Nettoyage à la fermeture de la fenêtre
      tasmotaWindow.on('closed', () => {
         currentwidgetState = false;

         ipc.removeHandler('tasmota-config');
         ipc.removeHandler('tasmota-localIP');
         ipc.removeHandler('tasmota-msg');
         ipc.removeAllListeners('tasmota-quit');

         tasmotaWindow = null;
      });
   } catch (error) {
      console.error('❌ Erreur lors de l’ouverture de la fenêtre Tasmota:', error.message);
   }
};

const saveConfig = async (configValue) => {
   try {
      const configPath = path.resolve(__dirname, 'tasmota.prop');

      let configProp = {};
      if (fs.existsSync(configPath)) {
         try {
            const fileContent = fs.readFileSync(configPath, 'utf8');
            configProp = JSON.parse(fileContent);
         } catch (parseError) {
            console.error('Erreur lors de la lecture du fichier :', parseError.message);
            return false;
         }
      }

      // Mise à jour des paramètres dans la config
      configProp.modules = configProp.modules ?? {};
      configProp.modules.tasmota = configProp.modules.tasmota ?? {};
      configProp.modules.tasmota.settings = {
         ...configProp.modules.tasmota.settings,
         active: configValue.authActive,
         username: configValue.username,
         password: configValue.password,
      };

      // Écriture de la configuration dans le fichier
      fs.writeFileSync(configPath, JSON.stringify(configProp, null, 2));

      // Mettre à jour la configuration globale en mémoire
      Config.modules.tasmota.settings = { ...configProp.modules.tasmota.settings };

      // Relancer l'init de la config dans tasmotaAPI
      // tasmotaAPI.initVar(Config.modules.tasmota);

      // Mise à jour des devices
      await refreshDevices();

      return true;
   } catch (error) {
      return false;
   }
};

const refreshDevices = async () => {
   try {
      const devices = await tasmotaAPI.scanTasmotaDevices();
      const rooms = await Avatar.APIFunctions.getPeriphRooms(devices);

      periphInfo = await Avatar.APIFunctions.classPeriphByRooms(rooms, devices);

      periphInfo.push({
         Buttons: [
            {
               name: Locale.get('label.settings'),
               value_type: 'button',
               usage_name: 'Button',
               periph_id: '555555',
               notes: Locale.get('label.title'),
            },
         ],
      });

      // Si le widget Tasmota est activé, on met à jour ses données
      if (Config.modules.tasmota.widget.display === true) {
         Avatar.Interface.refreshWidgetInfo({ plugin: 'tasmota', id: '555555' });
      }
   } catch (error) {
      return null;
   }
};

const setTasmotaPeriph = async (data) => {
   const periph = data.periph;
   const data_periph = await tasmotaAPI.getDeviceDirectInfos(periph);

   let tts = '';

   try {
      const result = await tasmotaAPI.set(periph, data.value);
      switch (result.last_value) {
         case '0':
            tts = await Locale.get(['speak.lightOff', data_periph.name]);
            break;
         case '1':
            tts = await Locale.get(['speak.lightOn', data_periph.name]);
            break;
         default:
            infoOrange(`tasmota -> type inconnu: ${result.value_type}`);
            return;
      }
      Avatar.speak(tts, data.client);
      if (!data.action) {
         data.action = {};
      }

      if (!Config.client) {
         data.action.client = 'Serveur';
      }
      data.id = periph;
      data.action.remote = false;

      updateWidgets(data);
   } catch (err) {
      return error('Erreur dans setTasmotaPeriph:');
   }
};

const updateWidgets = async (data) => {
   if (data.action.client === 'Serveur') {
      const payload = {
         action: {
            command: 'updateWidgetClient',
            client: 'Serveur',
            id: data.id,
            remote: true,
         },
      };

      const clients = Avatar.getAllClients();
      clients.forEach((client) => {
         Avatar.clientPlugin(client, 'tasmota', payload);
      });
      return Avatar.Interface.refreshWidgetInfo({ plugin: 'tasmota', id: data.id });
   }
      const srv = Config.modules.tasmota.settings.serveur;
      const port = Config.modules.tasmota.settings.port;
      const url = `http://${srv}:${port}/avatar/tasmota?command=updateInfo&id=${data.id}`;
   try {
      const response = await axios.get(url);
      if (response.status !== 200) {
         throw new Error('status ' + response.status);
      }

      return;
   } catch (err) {
      error('HTTP error:', err);
   }
};

const updateWidgetClient = async (data) => {
   Avatar.Interface.refreshWidgetInfo({ plugin: 'tasmota', id: data.action.id });
};
