(function () {
  'use strict';

  const IDLE = 'idle';
  const PROBE = 'probe';
  const COMPOSE = 'compose';

  function initial() {
    return { mode: IDLE, selection: null };
  }

  function reduce(state, action) {
    switch (action && action.type) {
      case 'SELECT': {
        if (!action.selection) return state;
        if (state.mode === IDLE || state.mode === PROBE) {
          return { mode: PROBE, selection: action.selection };
        }
        if (state.mode === COMPOSE) {
          return { mode: COMPOSE, selection: action.selection };
        }
        return state;
      }
      case 'CLEAR_SELECTION': {
        if (state.mode === PROBE) return { mode: IDLE, selection: null };
        return state;
      }
      case 'OPEN_COMPOSE': {
        if (state.mode === PROBE) {
          return { mode: COMPOSE, selection: state.selection };
        }
        return state;
      }
      case 'CANCEL': {
        if (state.mode === COMPOSE) return { mode: IDLE, selection: null };
        return state;
      }
      case 'SAVE': {
        if (state.mode === COMPOSE) return { mode: IDLE, selection: null };
        return state;
      }
      default:
        return state;
    }
  }

  const api = { initial, reduce, IDLE, PROBE, COMPOSE };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    self.CommentState = api;
  }
})();
