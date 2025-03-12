import axios from 'axios';

let Config;
let lanRange;
let authCredentials = null; // Stockage des identifiants d'authentification
const LastDateTime = formatDate(new Date());

// Cache simple pour les appareils découverts
let deviceCache = {
  devices: [],
  timestamp: null,
  expiryTime: 60000 // 1 minute en ms
};

// Fonction pour obtenir les appareils (avec cache)
async function getDevices() {

  const now = Date.now();

  // Utiliser le cache si valide
  if (deviceCache.devices.length > 0 &&
      deviceCache.timestamp &&
      (now - deviceCache.timestamp) < deviceCache.expiryTime) {
    return deviceCache.devices;
  }

  // Sinon, découvrir à nouveau
  const devices = await getTasmotaDevices(lanRange);
  deviceCache.devices = devices;
  deviceCache.timestamp = now;

  return devices;
}

// Ajout d'une fonction utilitaire pour inclure les identifiants d'authentification
function createAxiosInstance(ip, useAuth = true) {
  const instance = axios.create({
    baseURL: `http://${ip}`,
    timeout: 1000,
    auth: useAuth && authCredentials ? authCredentials : null // Utilisation conditionnelle des identifiants
  });
  return instance;
}

async function getPeriphCaract(id) {
  try {
    const devices = await getDevices();
    const device = devices.find(d => d.periph_id === id.toString());

    if (!device) {
      return error(`Aucun périphérique trouvé avec l'ID ${id}`);
      
    }

    return {
      periph_id: device.periph_id,
      name: device.name,
      ip: device.ip,
      last_value: device.info?.Power || '0',
      last_value_text: device.info?.Power === '1' ? 'On' : 'Off',
      unit: '',
      battery: device.battery || '',
      last_value_change: LastDateTime,
    };
  } catch (err) {
    return error(`Erreur getPeriphCaract [${id}]: ${err.message}`);
  }
}

async function getPeriphValues(id) {
  
  try {
    const devices = await getDevices();
    const device = devices.find(d => d.periph_id === id.toString());
    
    if (!device) {
      return error(`Aucun périphérique trouvé avec l'ID ${id}`);
    }

    return {
      periph_id: device.periph_id,
      values: [
        { value: 'Power 0', description: 'Off' },
        { value: 'Power 1', description: 'On' }
      ],
      // last_value_change: LastDateTime,
    };
  } catch (err) {
    return error('getPeriphValues tasmota function: ' + err);
  }
}

async function set(id, value) {
  try {
    const devices = await getDevices();
    const device = devices.find(d => d.periph_id === id.toString());

    if (!device) {
      throw new Error(`Aucun périphérique trouvé avec l'ID ${id}`);
    }

    const parameter = '';
    const encodedCommand = encodeURIComponent(`${value} ${parameter}`.trim());
    const axiosInstance = createAxiosInstance(device.ip);

    const response = await axiosInstance.get(`/cm?cmnd=${encodedCommand}`);

    // Mise à jour du cache après changement d'état
    if (response.data && device.info) {
      device.info.Power = value.includes('1') ? '1' : '0';
      device.timestamp = formatDate(new Date()); // Ne pas toucher
    }

    return response.data;
  } catch (err) {
    return error(`Erreur lors de l'envoi de la commande:`, err.message);
  }
}

async function macro(macro_id) {
  try {
    /*
    let url = 'http://....';

    const response = await axios ({
      url: url,
      method: 'get',
      responseType: 'json'
    });

    if (response.status !== 200 || response.data.success === "0") {
      throw new Error (`Impossible d'exécuter la macro ${macro_id}`)
    }
    */

    return;
  } catch (err) {
    console.error('macro tasmota function: ' + err);
  }
}

async function getPeriphInfos(id) {
  try {
    const devices = await getDevices();
    const device = devices.find(d => d.periph_id === id.toString());

    if (!device) {
      return error(`Aucun périphérique trouvé avec l'ID ${id}`);
    }

    return {
      periph_id: device.periph_id,
      parent_periph_id: device.periph_id,
      name: device.name || 'Tasmota Device',
      ip: device.ip,
      value_type: 'list',
      status: device.info?.Power,
      usage_name: 'switch',
      room_id: '1',
      last_value_change: LastDateTime,
    };
  } catch (err) {
    return error(`Erreur lors de la récupération des données pour ${id}:`, err.message);
  }
}

// Découverte des périphérique tasmota (SonOff)
async function discoverTasmotaDevices(networkRange) {
  const devices = [];
  const timeout = 1000;
  const searchPromises = [];

  for (let i = 1; i <= 254; i++) {
    const ip = `${networkRange}.${i}`;
    const axiosInstance = createAxiosInstance(ip);

    const promise = axiosInstance
      .get('/cm?cmnd=Status%200')
      .then(response => {
        if (response.data?.Status?.FriendlyName) {
          const device = {
            ip: ip,
            name: response.data.Status.FriendlyName[0] || 'Tasmota Device',
            module: response.data.Status.Module || 'Unknown',
            firmware: response.data.StatusFWR?.Version || 'Unknown'
          };
          devices.push(device);
        }
      })
      .catch(() => {
        return;
      });

    searchPromises.push(promise);
  }
  await Promise.all(searchPromises);
  return devices;
}


async function getTasmotaDeviceValues(deviceIp) {
  try {
    // Première tentative sans authentification
    let axiosInstance = createAxiosInstance(deviceIp, false);
    let statusResponse, powerResponse;

    try {
      [statusResponse, powerResponse] = await Promise.all([
        axiosInstance.get('/cm?cmnd=Status%200'),
        axiosInstance.get('/cm?cmnd=Status%2011')
      ]);
    } catch (error) {
      // Si la première tentative échoue, réessayer avec authentification
      axiosInstance = createAxiosInstance(deviceIp, true);
      [statusResponse, powerResponse] = await Promise.all([
        axiosInstance.get('/cm?cmnd=Status%200'),
        axiosInstance.get('/cm?cmnd=Status%2011')
      ]);
    }

    if (!statusResponse.data?.Status?.Topic) {
      console.error(`Données invalides`);
    }

    return {
      periph_id: createSixDigitSequence(statusResponse.data.Status.Topic),
      parent_periph_id: '',
      name: statusResponse.data.Status.DeviceName || 'Tasmota Device',
      ip: statusResponse.data.StatusNET?.IPAddress,
      value_type: 'list',
      usage_name: 'switch',
      room_id: '1',
      room_name: statusResponse.data.Status.FriendlyName?.[0] || "Invisible",
      usage_id: statusResponse.data.Status.Module,
      battery: '100',
      notes: '',
      last_value_change: formatDate(new Date()),
      info: statusResponse.data.Status,
      power: powerResponse.data?.StatusSTS
    };
  } catch (err) {
    return error(`Erreur pour ${deviceIp}:`, err.message);
  }
}

async function getTasmotaDevices(networkRange) {
  try {
    const discoveredDevices = await discoverTasmotaDevices(networkRange);

    // Traiter en parallèle tous les appareils découverts
    const devicePromises = discoveredDevices.map(dev =>
      getTasmotaDeviceValues(dev.ip).catch(() => null)
    );

    const devices = await Promise.all(devicePromises);
    return devices.filter(Boolean);
  } catch (err) {
    return error('Erreur de découverte Tasmota:', err);
  }
}

const createSixDigitSequence = id => {
  if (!id) return '000000';

  const partAfterUnderscore = id.split('_')[1] || '';
  const digits = partAfterUnderscore.match(/\d/g) || [];
  let result = digits.join('');

  while (result.length < 6) {
    result += result[result.length - 1] || '0';
  }

  return result.slice(0, 6);
};

var initVar = function (conf) {
  
  lanRange = conf?.settings?.ipRange || '192.168.1';
  Config = conf?.API;

  
  // Configuration des identifiants d'authentification
  if (conf?.settings?.username && conf?.settings?.password) {
    const decryptPassword = decrypt(conf?.settings?.password);
    authCredentials = {
      username: conf.settings.username,
      password: decryptPassword
    };
  } else {
    authCredentials = null; // Aucune authentification
  }
  // Réinitialiser le cache
  deviceCache = {
    devices: [],
    timestamp: null,
    expiryTime: 60000
  };
};

async function refreshCache() {
  deviceCache.devices = await getTasmotaDevices(lanRange);
  deviceCache.timestamp = Date.now();
  return deviceCache.devices.length;
}

// Fonction pour décrypter une chaîne (simple exemple avec Base64)
const decrypt = function (password) {
  try {
    return atob(password); // Décode depuis Base64
  } catch (error) {
    return
  }
 
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Mois commence à 0
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;;
}

async function init() {
  return {
    initVar: initVar,
    set: set,
    macro: macro,
    getPeriphCaract: getPeriphCaract,
    getPeriphValues: getPeriphValues,
    getPeriphInfos: getPeriphInfos,
    getTasmotaDevices: getTasmotaDevices,
    refreshCache: refreshCache
  };
}

export { init };