// Sélection des éléments du DOM
const title = document.querySelector('#title');
const toggleFormCheckbox = document.querySelector('#toggle-form');
const loginForm = document.querySelector('#login-form');
const usernameInput = document.querySelector('#username');
const passwordInput = document.querySelector('#password');
const ipInput = document.querySelector('#ip-serveur');
const usernameLabel = document.querySelector('#label-username');
const passwordLabel = document.querySelector('#label-password');
const ipLabel = document.querySelector('#label-ip-serveur');
const authLabel = document.querySelector('#label-auth');
const saveButton = document.querySelector('#save-button');
const closeButton = document.querySelector('#close-button');
const togglePasswordButton = document.querySelector('#toggle-password');
const searchIPButton = document.querySelector('#search-ip');

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
// Gestion du bouton pour basculer la visibilité du mot de passe
togglePasswordButton.addEventListener('click', () => {
   const type = passwordInput.type === 'password' ? 'text' : 'password';
   passwordInput.type = type; // Bascule entre 'password' et 'text'
});

// Gestion de l'affichage du formulaire
toggleFormCheckbox.addEventListener('change', () => {
   if (toggleFormCheckbox.checked) {
      loginForm.style.display = 'block';
   } else {
      loginForm.style.display = 'none';
   }
});

searchIPButton.addEventListener('click', async () => {
   const result = await window.electronAPI.getLocalIPv4();
   ipInput.value = result;
});

// Gestion de l'enregistrement des données
saveButton.addEventListener('click', async () => {
   const username = usernameInput.value;
   const password = passwordInput.value;
   const ipserveur = ipInput.value;

   const isChecked = toggleFormCheckbox.checked;

   const encryptedPassword = encrypt(password);

   let data = {
      authActive: isChecked,
      username: username,
      password: encryptedPassword,
      serveur: ipserveur,
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

// Fonction pour afficher une notification
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
   authLabel.innerHTML = await Lget('label.authentification');
   saveButton.innerHTML = await Lget('label.save');
   closeButton.innerHTML = await Lget('label.close');
   searchIPButton.innerHTML = await Lget('label.searchip');

   usernameInput.setAttribute('placeholder', await Lget('label.placeusername'));
   passwordInput.setAttribute('placeholder', await Lget('label.placepassword'));

   usernameInput.value = config.settings.username;
   passwordInput.value = decrypt(config.settings.password);
   ipInput.value = config.settings.serveur;
   if (config.settings.active) {
      toggleFormCheckbox.checked = true;
      loginForm.style.display = 'block';
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
