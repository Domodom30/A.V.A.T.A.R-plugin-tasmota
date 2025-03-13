// Sélection des éléments du DOM
const title = document.querySelector('#title')
const toggleFormCheckbox = document.querySelector('#toggle-form')
const loginForm = document.querySelector('#login-form')
const usernameInput = document.querySelector('#username')
const passwordInput = document.querySelector('#password')
const usernameLabel = document.querySelector('#label-username')
const passwordLabel = document.querySelector('#label-password')
const authLabel = document.querySelector('#label-auth')
const rangeLabel = document.querySelector('#label-range')
const ipRangeInput = document.querySelector('#ip-range')
const saveButton = document.querySelector('#save-button')
const closeButton = document.querySelector('#close-button')
const togglePasswordButton = document.getElementById('toggle-password')

window.onbeforeunload = async e => {
  e.returnValue = false
  window.electronAPI.quit()
}

const encrypt = function (password) {
  return btoa(password)
}

const decrypt = function (password) {
  return atob(password)
}
// Gestion du bouton pour basculer la visibilité du mot de passe
togglePasswordButton.addEventListener('click', () => {
  const type = passwordInput.type === 'password' ? 'text' : 'password'
  passwordInput.type = type // Bascule entre 'password' et 'text'
})

// Gestion de l'affichage du formulaire
toggleFormCheckbox.addEventListener('change', () => {
  if (toggleFormCheckbox.checked) {
    loginForm.style.display = 'block'
  } else {
    loginForm.style.display = 'none'
  }
})

// Gestion de l'enregistrement des données
saveButton.addEventListener('click', async () => {
  const username = usernameInput.value
  const password = passwordInput.value
  const ipRange = ipRangeInput.value
  const isChecked = toggleFormCheckbox.checked

  const encryptedPassword = encrypt(password)

  // validation de l'adresse IP
  if (!validateIP(ipRange)) {
    showNotification(await Lget('label.invalidip'), 'error')
    return
  }

  let data = {
    authActive: isChecked,
    username: username,
    password: encryptedPassword,
    ipRange: ipRange
  }

  if (!ipRange) {
    showNotification(await Lget('label.errorip'), 'error')
    return
  }
  if (isChecked && (!username || !password)) {
    showNotification(await Lget('label.errorauth'), 'error')
    return
  }

  if (!isChecked) {
    data = {
      authActive: isChecked,
      username: null,
      password: null,
      ipRange: ipRange
    }
  }

  const result = await window.electronAPI.setConfig(data)

  if (result === true) {
    showNotification(await Lget('label.notifsave'), 'success')
    return
  } else {
    showNotification(await Lget('label.error'), 'error')
  }
})

closeButton.addEventListener('click', () => {
  window.electronAPI.quit()
})

// Fonction de validation d'adresse IP
function validateIP(value) {
  if (!value) return false;
  
  const regex = /^192\.168\.(25[0-4]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])$/;
  return regex.test(value);
}

// Fonction pour afficher une notification
const showNotification = function (message, type = 'error') {
  notification.textContent = message
  notification.classList.remove('hidden', 'error', 'success')
  notification.classList.add(type)
  notification.style.display = 'block'

  setTimeout(() => {
    notification.classList.add('hidden')
    notification.style.display = 'none'
  }, 3000)
}

async function setTargets(config) {
  title.innerHTML = await Lget('label.title')
  usernameLabel.innerHTML = await Lget('label.username')
  passwordLabel.innerHTML = await Lget('label.password')
  rangeLabel.innerHTML = await Lget('label.range')
  authLabel.innerHTML = await Lget('label.authentification')
  saveButton.innerHTML = await Lget('label.save')
  closeButton.innerHTML = await Lget('label.close')

  usernameInput.setAttribute('placeholder', await Lget('label.placeusername'))
  passwordInput.setAttribute('placeholder', await Lget('label.placepassword'))
  ipRangeInput.setAttribute('placeholder', await Lget('label.placerange'))

  usernameInput.value = config.settings.username
  passwordInput.value = decrypt(config.settings.password)
  ipRangeInput.value = config.settings.ipRange
  if (config.settings.active) {
    toggleFormCheckbox.checked = true
    loginForm.style.display = 'block'
  }
}

const Lget = async (target, ...args) => {
  if (args) {
    target = [target]
    args.forEach(arg => {
      target.push(arg)
    })
  }

  return await window.electronAPI.getMsg(target)
}

window.electronAPI.onInitTasmota(async conf => {
  await setTargets(conf)
})
