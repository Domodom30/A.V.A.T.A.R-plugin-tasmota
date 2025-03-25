import axios from 'axios';
import os from 'os';
import * as path from 'node:path';
import fs from 'fs-extra';
import got from 'got';
import * as url from 'url';
import _ from 'underscore';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

let Config;
let Locale;
let LANG;
let authCredentials = null;

let deviceCache = {
   devices: new Map(),
   timestamp: null,
   expiryTime: 60000, // 1 minute en ms
};

let rooms_map = {};
let room_id_counter = 1;

// Dictionnaire bidirectionnel pour les traductions des pièces
// Dictionnaire de base : anglais -> français
const roomTranslations = {
   // Pièces de vie
   'Living room': 'Salon',
   'Dining room': 'Salle à manger',
   Kitchen: 'Cuisine',
   Office: 'Bureau',
   Entryway: 'Entrée',

   // Chambres
   room: 'Chambre',
   'Guest room': "Chambre d'amis",
   'Master bedroom': 'Chambre principale',
   'Kids room': 'Chambre des enfants',

   // Salles d'eau
   Bathroom: 'Salle de bain',
   'Shower room': 'Salle de douche',
   Toilet: 'Toilettes',
   'Laundry room': 'Buanderie',

   // Espaces annexes
   Garage: 'Garage',
   Basement: 'Sous-sol',
   Attic: 'Grenier',
   'Storage room': 'Débarras',
   Closet: 'Placard',

   // Extérieurs
   Garden: 'Jardin',
   Terrace: 'Terrasse',
   Balcony: 'Balcon',
   Patio: 'Patio',
   'Pool area': 'Zone piscine',
   Courtyard: 'Cour',

   // Divers
   Hallway: 'Couloir',
   Stairs: 'Escaliers',
   Playroom: 'Salle de jeux',
   'Home theater': 'Salle de cinéma',
   Gym: 'Salle de sport',
};

const REQUEST_TIMEOUT = 2000;
const MAX_CONCURRENT_REQUESTS = 50;

/**
 * Fonction principale de scan
 */
async function scanTasmotaDevices() {
   const { baseIp, startIp, endIp } = getNetworkInfo();
   const devices = [];

   resetRoomsMap();

   deviceCache.devices.clear(); // Réinitialisation du cache
   deviceCache.timestamp = Date.now();

   const ipsToScan = Array.from({ length: endIp - startIp + 1 }, (_, i) => `${baseIp}${i + startIp}`);
   const results = await asyncPool(MAX_CONCURRENT_REQUESTS, ipsToScan, scanDevice);

   for (const device of results) {
      if (device) {
         devices.push(device);
         deviceCache.devices.set(device.periph_id, device); // Ajout à la Map
      }
   }

   return devices;
}

async function scanDevice(ip) {
   const url = `http://${ip}/cm?cmnd=Status%200`;

   try {
      const response = await axios.get(url, {
         auth: authCredentials || undefined,
         timeout: REQUEST_TIMEOUT,
      });

      return parseTasmotaResponse(ip, response.data);
   } catch (errorAuth) {
      if (errorAuth.response?.status === 401) {
         try {
            const response = await axios.get(url, { timeout: REQUEST_TIMEOUT });
            return parseTasmotaResponse(ip, response.data);
         } catch (errorNoAuth) {
            console.warn(`Device ${ip} inaccessible sans auth.`);
         }
      } else {
         return null;
      }
   }

   return null;
}

function parseTasmotaResponse(ip, data) {
   if (!data?.Status) {
      return null;
   }

   const roomName = data.Status.FriendlyName?.[0] || 'Unknown';

   const deviceInfo = {
      periph_id: createSixDigitSequence(data.Status.Topic),
      parent_periph_id: '',
      name: data.Status.DeviceName || 'Tasmota Device',
      ip,
      value_type: 'list',
      usage_name: 'switch',
      room_id: getRoomId(roomName),
      room_name: roomName,
      version: data.StatusFWR?.Version || 'Unknown',
      mac: data.StatusNET?.Mac || 'Unknown',
      last_value: data.Status.Power?.toString() || '0',
      last_value_text: data.Status.Power === '1' ? 'On' : 'Off',
      unit: '',
      battery: data.Status.battery || 'N/A',
      last_value_change: formatDate(new Date()),
   };

   return deviceInfo;
}

async function asyncPool(poolLimit, array, iteratorFn) {
   const ret = [];
   const executing = [];

   for (const item of array) {
      const p = Promise.resolve().then(() => iteratorFn(item));
      ret.push(p);

      if (poolLimit <= array.length) {
         executing.push(p);

         if (executing.length >= poolLimit) {
            await Promise.race(executing);
            executing.splice(
               executing.findIndex((e) => e === p),
               1
            );
         }
      }
   }

   return Promise.all(ret);
}

/**
 * Détecte l'IP locale et en déduit la plage IP à scanner
 */
function getNetworkInfo() {
   const interfaces = os.networkInterfaces();
   let localIp;

   for (const name in interfaces) {
      for (const iface of interfaces[name]) {
         if (iface.family === 'IPv4' && !iface.internal) {
            localIp = iface.address;
            break;
         }
      }
      if (localIp) break;
   }

   if (!localIp) {
      throw new Error("❌ Impossible de déterminer l'adresse IP locale");
   }

   const subnetParts = localIp.split('.');
   return {
      baseIp: `${subnetParts[0]}.${subnetParts[1]}.${subnetParts[2]}.`,
      startIp: 1,
      endIp: 254,
   };
}

/**
 * Récupère les informations d'un périphérique directement via une requête HTTP
 * sans utiliser le cache et met à jour l'état si applicable
 * @param {string} id - Identifiant du périphérique
 * @returns {Promise<Object|null>} - Objet device avec les informations mises à jour ou null si non trouvé
 */
async function getDeviceDirectInfos(id) {
   const cachedDevice = getDeviceById(id);
   if (!cachedDevice) {
      console.error(`Impossible de trouver l'IP du périphérique avec l'ID ${id}`);
      return null;
   }

   const ip = cachedDevice.ip;
   const url = `http://${ip}/cm?cmnd=Status%200`;

   try {
      // Tentative d'abord avec les identifiants d'authentification s'ils existent
      const response = await axios.get(url, {
         auth: authCredentials || undefined,
         timeout: REQUEST_TIMEOUT,
      });

      // Création de l'objet device à partir de la réponse
      const parsedResponse = parseTasmotaResponse(ip, response.data);

      if (!parsedResponse) {
         return null;
      }

      const device = parsedResponse;

      // Récupération et analyse de l'état du périphérique
      if (response.data?.Status?.Power !== undefined) {
         const powerState = response.data.Status.Power.toString();
         if (powerState === '0' || powerState === '1') {
            device.last_value = powerState;
            device.last_value_text = powerState === '1' ? 'On' : 'Off';
            device.last_value_change = formatDate(new Date());

            // Mise à jour du cache avec les nouvelles données
            deviceCache.devices.set(id.toString(), device);
         }
      }

      return device;
   } catch (errorAuth) {
      // Si erreur 401, on tente sans authentification
      if (errorAuth.response?.status === 401) {
         try {
            const response = await axios.get(url, { timeout: REQUEST_TIMEOUT });

            const parsedResponse = parseTasmotaResponse(ip, response.data);
            if (!parsedResponse) {
               return null;
            }

            const device = parsedResponse;

            if (response.data?.Status?.Power !== undefined) {
               const powerState = response.data.Status.Power.toString();
               if (powerState === '0' || powerState === '1') {
                  device.last_value = powerState;
                  device.last_value_text = powerState === '1' ? 'On' : 'Off';
                  device.last_value_change = formatDate(new Date());

                  // Mise à jour du cache avec les nouvelles données
                  deviceCache.devices.set(id.toString(), device);
               }
            }

            return device;
         } catch (errorNoAuth) {
            console.error(`Périphérique ${ip} inaccessible sans authentification: ${errorNoAuth.message}`);
            return null;
         }
      } else {
         console.error(`Erreur lors de la récupération des informations du périphérique ${ip}: ${errorAuth.message}`);
         return null;
      }
   }
}

function getDeviceById(id) {
   if (!id) return null;
   return deviceCache.devices.get(id.toString()) || null;
}

async function getPeriphCaract(id) {
   const device = await getDeviceDirectInfos(id);

   if (!device) {
      console.error(`Aucun périphérique trouvé avec l'ID ${id}`);
      return null;
   }

   return {
      periph_id: device.periph_id,
      name: device.name,
      ip: device.ip,
      room_name: device.room_name,
      last_value: device.last_value,
      last_value_text: device.last_value_text,
      unit: device.unit || '',
      battery: device.battery || 'N/A',
      last_value_change: formatDate(new Date()),
   };
}

async function getPeriphValues(id) {
   const device = await getDeviceDirectInfos(id);

   if (!device) {
      console.error(`Aucun périphérique trouvé avec l'ID ${id}`);
      return null;
   }

   return {
      periph_id: id,
      values: [
         { value: '0', description: 'Off' },
         { value: '1', description: 'On' },
      ],
   };
}

async function getPeriphInfos(id) {
   const device = await getDeviceDirectInfos(id);

   if (!device) {
      console.error(`Aucun périphérique trouvé avec l'ID ${id}`);
      return null;
   }

   return {
      periph_id: device.periph_id,
      parent_periph_id: device.parent_periph_id,
      name: device.name,
      room_name: device.room_name,
      ip: device.ip,
      value_type: device.value_type,
      last_value: device.last_value,
      last_value_text: device.last_value_text,
      status: device.last_value,
      usage_name: device.usage_name,
      room_id: device.room_id,
      last_value_change: device.last_value_change,
   };
}

async function set(id, command) {
   if (!id || command === undefined || command === null) return null;

   // const device = getDeviceById(id);
   const device = await getDeviceDirectInfos(id);

   if (!device) {
      console.error(`Aucun périphérique trouvé avec l'ID ${id}`);
      return null;
   }

   try {
      let normalizedCommand = command;

      // Si command est 0 ou 1 (en number ou string), on le transforme en 'power 0' / 'power 1'
      const numericCommand = Number(command);

      if (!isNaN(numericCommand) && (numericCommand === 0 || numericCommand === 1)) {
         normalizedCommand = `power ${numericCommand}`;
      }

      const encodedCommand = encodeURIComponent(normalizedCommand.trim());
      const url = `http://${device.ip}/cm?cmnd=${encodedCommand}`;

      await axios.get(url, {
         auth: authCredentials || undefined,
         timeout: REQUEST_TIMEOUT,
      });

      // Gestion de l'état (stockage dans device)
      if (normalizedCommand.toLowerCase().startsWith('power')) {
         const parts = normalizedCommand.trim().split(' ');
         const lastPart = parts[parts.length - 1];

         if (lastPart === '0' || lastPart === '1') {
            const newState = lastPart;
            device.last_value = newState;
            device.last_value_text = newState === '1' ? 'On' : 'Off';
            device.last_value_change = formatDate(new Date());

            deviceCache.devices.set(id.toString(), device);
         }
      }
      return device;
   } catch (err) {
      console.error(`Erreur lors de l'envoi de la commande à ${device.name}:`, err.message);
      return null;
   }
}

function getRoomId(roomName) {
   if (!roomName) {
      roomName = 'Unknown';
   }

   if (rooms_map[roomName]) {
      return rooms_map[roomName];
   }

   const newId = room_id_counter.toString();
   rooms_map[roomName] = newId;
   room_id_counter++;

   return newId;
}

function resetRoomsMap() {
   rooms_map = {};
   room_id_counter = 1;
}

function getDeviceCache() {
   return Array.from(deviceCache.devices.values());
}

function decrypt(password) {
   try {
      return Buffer.from(password, 'base64').toString('utf-8');
   } catch (error) {
      console.error('Erreur de décryptage du mot de passe');
      return null;
   }
}

function formatDate(date) {
   const year = date.getFullYear();
   const month = String(date.getMonth() + 1).padStart(2, '0');
   const day = String(date.getDate()).padStart(2, '0');
   const hours = String(date.getHours()).padStart(2, '0');
   const minutes = String(date.getMinutes()).padStart(2, '0');
   const seconds = String(date.getSeconds()).padStart(2, '0');
   return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function createSixDigitSequence(id) {
   if (!id) return '000000';
   const partAfterUnderscore = id.split('_')[1] || '';
   const digits = partAfterUnderscore.match(/\d/g) || [];
   let result = digits.join('');
   while (result.length < 6) {
      result += result[result.length - 1] || '0';
   }
   return result.slice(0, 6);
}

// Créer le dictionnaire bidirectionnel
function createBidirectionalTranslations(translations) {
   const bidirectional = { ...translations };
   for (const [en, fr] of Object.entries(translations)) {
      bidirectional[fr] = en;
   }
   return bidirectional;
}

// Création du dictionnaire final à utiliser
const bidirectionalRoomTranslations = createBidirectionalTranslations(roomTranslations);

function updateClientsProp(clients, deviceInfo) {
   const roomName = deviceInfo.room_name;
   const roomNameTranslated = bidirectionalRoomTranslations[roomName];

   if (!roomNameTranslated) {
      console.warn(`⚠️ Aucune traduction trouvée pour la pièce: "${roomName}"`);
      return;
   }

   const roomNameEn = translateToEnglish(roomName);
   const roomNameFr = translateToFrench(roomName);
   const switchName = `${roomNameEn} ${deviceInfo.usage_name}`;

   if (!clients[roomNameEn]) {
      clients[roomNameEn] = {};
   }
   clients[roomNameEn][switchName] = deviceInfo.periph_id;

   if (!clients[roomNameFr]) {
      clients[roomNameFr] = {};
   }
   clients[roomNameFr][switchName] = deviceInfo.periph_id;
}

async function updateRuleGroups(ruleGroups, deviceInfo) {
   if (!ruleGroups.switch) {
      ruleGroups.switch = {
         0: [],
         1: [],
         command: 'set',
         answer: "Génial, j'ai bien effectué l'action demandée",
      };
   }

   const deviceLabel = deviceInfo.name || 'Tasmota';
   const deviceLabelLower = await translateSentence(deviceLabel.toLowerCase()); // Ex: 'led stripe'

   const offCommand1 = `turn off * ${deviceLabelLower}`;
   const offCommand2 = `{extins} * ${deviceLabelLower}`;

   const onCommand1 = `turn on * ${deviceLabelLower}`;
   const onCommand2 = `{light} * ${deviceLabelLower}`;

   // Ajouter à la liste des commandes OFF (0)
   if (!ruleGroups.switch['0'].includes(offCommand1)) {
      ruleGroups.switch['0'].push(offCommand1);
   }

   if (!ruleGroups.switch['0'].includes(offCommand2)) {
      ruleGroups.switch['0'].push(offCommand2);
   }

   // Ajouter à la liste des commandes ON (1)
   if (!ruleGroups.switch['1'].includes(onCommand1)) {
      ruleGroups.switch['1'].push(onCommand1);
   }

   if (!ruleGroups.switch['1'].includes(onCommand2)) {
      ruleGroups.switch['1'].push(onCommand2);
   }
}

// Utilitaires pour la traduction
function translateToEnglish(roomName) {
   // Si déjà en anglais, retour direct
   if (roomTranslations[roomName]) return roomName;
   // Sinon, cherche l'anglais correspondant
   return bidirectionalRoomTranslations[roomName] || roomName;
}

function translateToFrench(roomName) {
   // Si déjà en français, retour direct
   if (Object.values(roomTranslations).includes(roomName)) return roomName;
   // Sinon, cherche le français correspondant
   return bidirectionalRoomTranslations[roomName] || roomName;
}

const translateSentence = async (words) => {
   let url = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=' + 'fr' + '&tl=en&q=' + encodeURIComponent(words);
   return got
      .post(url)
      .then((res) => {
         const result = JSON.parse(res.body);
         return typeof result[0] === 'string' ? result[0].toLowerCase() : result[0][0].toLowerCase();
      })
      .catch((err) => {
         error('translate error:', err);
         return false;
      });
};

// Fonction lire, mettre à jour et sauvegarder le prop
async function updateConfigFile(devicesInfoList) {
   try {
      const absolutePath = path.resolve(__dirname, '../tasmota.prop');
      const jsonData = fs.readFileSync(absolutePath, 'utf8');
      const config = JSON.parse(jsonData);

      // clone avec JSON pour comparaison future
      const originalConfig = JSON.parse(JSON.stringify(config));

      const tasmota = config.modules.tasmota;

      if (!tasmota.clients) {
         tasmota.clients = {};
      }

      if (!tasmota.intents) {
         tasmota.intents = {};
      }

      if (!tasmota.ruleGroups) {
         tasmota.ruleGroups = {};
      }

      for (const deviceInfo of devicesInfoList) {
         if (!deviceInfo || !deviceInfo.usage_name) {
            infoOrange(`Périphérique invalide ou sans usage_name :`, deviceInfo);
            continue;
         }

         if (!tasmota.intents[deviceInfo.usage_name]) {
            tasmota.intents[deviceInfo.usage_name] = [];
         }

         updateClientsProp(tasmota.clients, deviceInfo);

         const roomNameEn = translateToEnglish(deviceInfo.room_name || 'Unknown');
         const switchName = `${roomNameEn} ${deviceInfo.usage_name}`;

         if (!tasmota.intents[deviceInfo.usage_name].includes(switchName)) {
            tasmota.intents[deviceInfo.usage_name].push(switchName);
         }

         await updateRuleGroups(tasmota.ruleGroups, deviceInfo);
      }

      if (!tasmota.settings.serveur) {
         tasmota.settings.serveur = getLocalIPv4();
      }

      // Comparaison
      if (_.isEqual(config, originalConfig)) {
         infoOrange('Tasmota: ', Locale.get('msg.noupdate'));
         return;
      }

      fs.writeFileSync(absolutePath, JSON.stringify(config, null, 2), 'utf8');
      infoGreen('Tasmota: ', Locale.get('msg.update'));
   } catch (error) {
      return error('Tasmota: ', Locale.get('msg.error'));
   }
}

// Determine l'adresse IPV4
function getLocalIPv4() {
   const interfaces = os.networkInterfaces();

   for (const ifaceName of Object.keys(interfaces)) {
      for (const iface of interfaces[ifaceName]) {
         if (iface.family === 'IPv4' && !iface.internal) {
            return iface.address;
         }
      }
   }
   return '127.0.0.1';
}

async function initLang(lang) {
   Locale = await Avatar.lang.getPak('tasmota', lang);
}

function initVar(conf) {
   Config = conf?.API || null;

   if (conf?.settings?.username && conf?.settings?.password) {
      const decryptPassword = decrypt(conf.settings.password);
      authCredentials = {
         username: conf.settings.username,
         password: decryptPassword,
      };
   } else {
      authCredentials = null;
   }
}

async function init() {
   return {
      initVar,
      initLang,
      scanTasmotaDevices,
      getDeviceCache,
      set,
      getDeviceById,
      getPeriphCaract,
      getPeriphValues,
      getPeriphInfos,
      getDeviceDirectInfos,
      updateConfigFile,
      getLocalIPv4,
   };
}

export { init };
