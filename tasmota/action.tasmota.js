import { default as _helpers } from '../../ia/node_modules/ava-ia/helpers/index.js';

export default function (state) {
  return new Promise((resolve) => {
    setTimeout(() => {
      state.action = {
        module: 'tasmota',
        command: state.command,
        periph: state.periph,
        value: state.value,
        details: state.details,
      };

      resolve(state);
    }, Config.waitAction.time || 0);
  });
}
