import { default as _helpers } from '../../ia/node_modules/ava-ia/helpers/index.js';
import _ from 'underscore';

export default async function (state, actions) {
  let match, command, type, value, periph, answer;

  // The intents object in the property file
  let tbl = Object.keys(Config.modules.tasmota.intents);

  let clientTo = Avatar.clientFromRule(state.rawSentence);

  // Check if clientTo is undefined, if so set it to state.client
  if (clientTo === undefined) {
    clientTo = Avatar.clientFromRule(state.client);
  }

  // for all entries of the "intents" object
  for (let i = 0; i < tbl.length && !match; i++) {
    type = tbl[i];
    for (value in Config.modules.tasmota.ruleGroups[type]) {
      if (value !== 'command' && value !== 'answer') {
        const rules = Config.modules.tasmota.ruleGroups[type][value];

        match = (0, _helpers.syntax)(state.sentence, rules);

        if (match !== undefined) {
          command = Config.modules.tasmota.ruleGroups[type].command || false;
          answer = Config.modules.tasmota.ruleGroups[type].answer || false;

          // Keeps the periph ID in the "clients" object
          _.map(Config.modules.tasmota.intents[type], (num) => {
            if (Config.modules.tasmota.clients[clientTo][num]) {
              periph = Config.modules.tasmota.clients[clientTo][num];
            }
          });
          break;
        }
      }
    }
  }

  // Is intent resolved?
  if (match) {
    state.isIntent = true;
    state.command = command; // exemple : "set"
    state.periph = periph ? periph : false; // ex : 388444
    state.value = value ? value : false; // "1" dans ton ruleGroup
    state.details = match; // ex : { adjective: 'Light' }

    // Action déclenchée
    return (0, _helpers.factoryActions)(state, actions);
  } else {
    // otherwize continues to check next plugin
    return (0, _helpers.resolve)(state);
  }
}
