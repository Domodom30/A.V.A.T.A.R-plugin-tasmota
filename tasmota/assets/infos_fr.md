# Tasmota v1.3.0

<div style="text-align: left; margin: 10px 0">
<img src="../../core/plugins/tasmota/assets/images/tasmota.png" width="40"/></div>


### ✨ Fonctionnalité

Le plugin Widget Tasmota permet simplement de controler et d'afficher vos périphériques Tasmota [A.V.A.T.A.R](https://github.com/Avatar-Home-Automation).

### ✨ Nouvelles Fonctionnalités

- Ajout la possibilité de faire parler Avatar lors d'une action sur un widget tasmota.
- Réglage du port serveur pour les updates widgets.
- Ajout de l'icone settings sur les clients.

## Configuration

1. Une fenêtre de configuation s'ouvre <div style="text-align: center;">
<img src="../../core/plugins/tasmota/assets/images/docs/window.png" width="180"/></div>
2. Dans le cas ou vos modules sonoff requiert un login et un mot de passe, renseignez la partie authentification.
   
### Après l'installation du plugin et à l'ouverture du serveur Avatar 

1. Le plugin va alors scanner vos modules présents sur le réseau.
2. Selon le nom du module et le nom de pièce renseignés dans vos modules, le plugin mettra à jour automatiquement les règles dans le fichier prop.
3. Lors du transfert du plugin sur les clients, les widgets associés au nom du client seront visibles.
4. Sur le serveur tous les widgets peuvent être accessible.


<div style="text-align: center;">
<img src="../../core/plugins/tasmota/assets/images/docs/ws.png" width="350"/><img src="../../core/plugins/tasmota/assets/images/docs/ws-1.png" width="350"/></div>
