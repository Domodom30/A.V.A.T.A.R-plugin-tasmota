const title = document.querySelector('#title');
const toggleFormCheckbox = document.querySelector('#toggle-form');
const loginForm = document.querySelector('#login-form');
const usernameInput = document.querySelector('#username');
const passwordInput = document.querySelector('#password');
const ipInput = document.querySelector('#ip-serveur');
const portLabel = document.querySelector('#label-port-serveur');
const portInput = document.querySelector('#port-serveur');
const usernameLabel = document.querySelector('#label-username');
const passwordLabel = document.querySelector('#label-password');
const ipLabel = document.querySelector('#label-ip-serveur');
const authLabel = document.querySelector('#label-auth');
const saveButton = document.querySelector('#save-button');
const closeButton = document.querySelector('#close-button');
const togglePasswordButton = document.querySelector('#toggle-password');
const searchIPButton = document.querySelector('#search-ip');
const speakWidget = document.querySelector('#speak-widget');
const speakWidgetLabel = document.querySelector('#label-speak-widget');

window.onbeforeunload = async (e) => {
   e.returnValue = false;
   window.electronAPI.quit();
};

const encrypt = function (password) {
   return btoa(password);
};

const decrypt = function (password) {
   return atob(password);
};

togglePasswordButton.addEventListener('click', () => {
   const type = passwordInput.type === 'password' ? 'text' : 'password';
   passwordInput.type = type;
});

toggleFormCheckbox.addEventListener('toggle', () => {
   if (toggleFormCheckbox.toggled) {
      loginForm.style.display = 'block';
   } else {
      loginForm.style.display = 'none';
   }
});

searchIPButton.addEventListener('click', async () => {
   const result = await window.electronAPI.getLocalIPv4();
   ipInput.value = result;
});

saveButton.addEventListener('click', async () => {
   const username = usernameInput.value;
   const password = passwordInput.value;
   const ipserveur = ipInput.value;
   const portserveur = portInput.value;

   const isChecked = toggleFormCheckbox.toggled;
   const isCheckedSpeak = speakWidget.toggled;

   const encryptedPassword = encrypt(password);

   let data = {
      authActive: isChecked,
      username: username,
      password: encryptedPassword,
      serveur: ipserveur,
      port: portserveur,
      speakAction: isCheckedSpeak,
   };

   if (isChecked && (!username || !password)) {
      showNotification(await Lget('label.errorauth'), 'error');
      return;
   }

   if (!ipserveur) {
      showNotification(await Lget('label.errorauth'), 'error');
      return;
   }
   if (!isChecked) {
      data = {
         authActive: isChecked,
         username: null,
         password: null,
         serveur: ipserveur,
         port: portserveur,
         speakAction: isCheckedSpeak,
      };
   }

   const result = await window.electronAPI.setConfig(data);

   if (result === true) {
      showNotification(await Lget('label.notifsave'), 'success');
      return;
   } else {
      showNotification(await Lget('label.error'), 'error');
   }
});

closeButton.addEventListener('click', () => {
   window.electronAPI.quit();
});

const showNotification = function (message, type = 'error') {
   notification.textContent = message;
   notification.classList.remove('hidden', 'error', 'success');
   notification.classList.add(type);
   notification.style.display = 'block';

   setTimeout(() => {
      notification.classList.add('hidden');
      notification.style.display = 'none';
   }, 3000);
};

async function setTargets(config) {
   title.innerHTML = await Lget('label.title');
   usernameLabel.innerHTML = await Lget('label.username');
   passwordLabel.innerHTML = await Lget('label.password');
   ipLabel.innerHTML = await Lget('label.ipserveur');
   portLabel.innerHTML = await Lget('label.portserveur');
   authLabel.innerHTML = await Lget('label.authentification');
   saveButton.innerHTML = await Lget('label.save');
   closeButton.innerHTML = await Lget('label.close');
   searchIPButton.innerHTML = await Lget('label.searchip');

   usernameInput.setAttribute('placeholder', await Lget('label.placeusername'));
   passwordInput.setAttribute('placeholder', await Lget('label.placepassword'));

   speakWidgetLabel.innerHTML = await Lget('label.speakWidget');

   usernameInput.value = config.settings.username;
   passwordInput.value = decrypt(config.settings.password);

   portInput.value = config.settings.port;

   ipInput.value = config.settings.serveur;
   if (config.settings.active) {
      toggleFormCheckbox.toggled = true;
      loginForm.style.display = 'block';
   }
   if (config.settings.speakAction) {
      speakWidget.toggled = true;
   }
}

const Lget = async (target, ...args) => {
   if (args) {
      target = [target];
      args.forEach((arg) => {
         target.push(arg);
      });
   }

   return await window.electronAPI.getMsg(target);
};

window.electronAPI.onInitTasmota(async (conf) => {
   await setTargets(conf);
});
