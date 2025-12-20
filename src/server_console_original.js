// Copyright (c) 2025 delfineonx
// This product includes "Server Console" created by delfineonx.
// This product includes "Task Scheduler" created by delfineonx, chmod, FrostyCaveman.
// Licensed under the Apache License, Version 2.0.

// Task Scheduler source code here

// Server Console Core
{
  const _SC = {
    playerCommand: null,
    onPlayerJoin: null,
    onPlayerLeave: null,

    parse: null,
    split: null,
    resolveNames: null,
    playersTokenError: null,

    command: Object.create(null),

    _playerNameById: Object.create(null), // id -> "Name"
    _playerIdByName: Object.create(null), // "Name" -> id
    _playerData: Object.create(null), // id -> { showSCout: bool }
    _operationId: 0,
    _lastCommandGroupId: "SC0",
  };

  const _playerNameById = _SC._playerNameById;
  const _playerIdByName = _SC._playerIdByName;
  const _playerData = _SC._playerData;
  const _command = _SC.command;

  // supports: \[  \]  \\  \n  \r  \t
  const _UNESCAPE = /\\([\\\[\]nrt])/g;
  const _unescapeRepl = (_match, char) => {
    if (char === "n") return "\n";
    if (char === "r") return "\r";
    if (char === "t") return "\t";
    return char;
  };
  const _parse = _SC.parse = (str) => {
    const tokens = [];
    const n = str.length;

    // 0 = skip whitespace
    // 1 = normal token
    // 2 = bracket token
    let state = 0;

    let start = 0;
    let hasBackslash = 0;
    let escaped = 0; // only for bracket token (skip next char for closing-] detection)

    for (let i = 0; i < n; i++) {
      const charCode = str.charCodeAt(i);

      if (state === 0) {
        if (charCode <= 32) {
          continue;
        }

        if (charCode === 91) { // '['
          state = 2;
          start = i + 1;
          hasBackslash = 0;
          escaped = 0;
        } else {
          state = 1;
          start = i;
          hasBackslash = (charCode === 92); // '\' as first char in token
        }
        continue;
      }

      if (state === 1) {
        if (charCode <= 32) {
          let token = str.slice(start, i);
          if (hasBackslash) {
            token = token.replace(_UNESCAPE, _unescapeRepl);
          }
          tokens.push(token);
          state = 0;
        } else if (charCode === 92) {
          hasBackslash = 1;
        }
        continue;
      }

      if (escaped) {
        escaped = 0;
        continue;
      }

      if (charCode === 92) { // '\'
        hasBackslash = 1;
        escaped = 1;
        continue;
      }

      if (charCode === 93) { // ']'
        let token = str.slice(start, i);
        if (hasBackslash) {
          token = token.replace(_UNESCAPE, _unescapeRepl);
        }
        tokens.push(token);
        state = 0;
      }
    }

    // flush last token if string ended while inside one
    if (state === 1 || state === 2) {
      let token = str.slice(start, n);
      if (hasBackslash) {
        token = token.replace(_UNESCAPE, _unescapeRepl);
      }
      tokens.push(token);
    }

    return tokens;
  };
  const _split = _SC.split = (str) => {
    const tokens = [];
    const n = str.length;

    // 0 = skip whitespace
    // 1 = in token
    let state = 0;

    let start = 0;

    for (let i = 0; i < n; i++) {
      const charCode = str.charCodeAt(i);

      if (state === 0) {
        if (charCode <= 32) {
          continue;
        }
        state = 1;
        start = i;
        continue;
      }

      // state === 1
      if (charCode <= 32) {
        tokens.push(str.slice(start, i));
        state = 0;
      }
    }

    // flush last token if string ended while inside one
    if (state === 1) {
      tokens.push(str.slice(start, n));
    }

    return tokens;
  };

  _SC.resolveNames = (userId, str) => {
    const tokens = _split(str);

    const include = {}; // id -> 1
    const exclude = {}; // id -> 1
    let includeAny = 0, includeAll = 0, excludeAny = 0, excludeAll = 0;

    const targets = [];
    const unspecified = [];
    const invalid = [];

    for (let i = 0; i < tokens.length; i++) {
      let token = tokens[i];

      const isExclusive = (token[0] === "-");
      if (isExclusive) { token = token.slice(1); }

      if (token === "all") {
        if (isExclusive) {
          excludeAll = 1;
        } else {
          includeAll = 1;
        }
        continue;
      }
      if (token === "me") {
        if (isExclusive) {
          exclude[userId] = 1;
          excludeAny = 1;
        } else {
          include[userId] = 1;
          includeAny = 1;
        }
        continue;
      }

      let matchId = _playerIdByName[token];
      let matchCount = 0;
      
      // 1) exact match (case-sensitive)
      if (matchId !== undefined) {
        if (isExclusive) {
          exclude[matchId] = 1;
          excludeAny = 1;
        } else {
          include[matchId] = 1;
          includeAny = 1;
        }
        continue;
      }

      // 2) partial match (case-sensitive)
      if (token.length < 4) {
        invalid.push(token);
        continue;
      }
      for (const playerName in _playerIdByName) {
        if (playerName.indexOf(token) !== -1) {
          if (++matchCount > 1) { break; }
          matchId = _playerIdByName[playerName];
        }
      }
      if (matchCount === 1) {
        if (isExclusive) {
          exclude[matchId] = 1;
          excludeAny = 1;
        } else {
          include[matchId] = 1;
          includeAny = 1;
        }
      } else if (!matchCount) {
        invalid.push(token);
      } else {
        unspecified.push(token);
      }
    }

    if (!excludeAll) {
      if (includeAll || (!includeAny && excludeAny)) {
        for (const id in _playerNameById) {
          if (!exclude[id]) { targets.push(id); }
        }
      } else {
        for (const id in include) {
          if (!exclude[id]) { targets.push(id); }
        }
      }
    }

    return [targets, unspecified, invalid];
  };
  _SC.playersTokenError = (commandName, userId, resolvedIds) => {
    if (resolvedIds[1].length > 0) {
      api.sendMessage(userId, "Server Console: /" + commandName + ": Multiple players: " + resolvedIds[1].join(", "), { color: "#fcd373" });
    }
    if (resolvedIds[2].length > 0) {
      api.sendMessage(userId, "Server Console: /" + commandName + ": Invalid players: " + resolvedIds[2].join(", "), { color: "#fcd373" });
    }
    if (resolvedIds[0].length === 0) {
      api.sendMessage(userId, "Server Console: /" + commandName + ": No players found.", { color: "#fcd373" });
      return true;
    }
    return false;
  };

  _SC.playerCommand = (userId, command) => {
    let tokens = _parse(command.trim());
    const name = tokens[0].toLowerCase();
    let result = null;
    if (_command[name]) {
      result = _command[name]._cmd(userId, tokens);
      if (result !== "Error") {
        _SC._lastCommandGroupId = result;
      }
    }
    if (_playerData[userId].showSCout) {
      api.sendMessage(userId, result);
    }
    return result;
  };
  _SC.onPlayerJoin = (playerId) => {
    const playerName = api.getEntityName(playerId);
    _playerNameById[playerId] = playerName;
    _playerIdByName[playerName] = playerId;
    _playerData[playerId] = {
      showSCout: false
    };
  };
  _SC.onPlayerLeave = (playerId) => {
    const playerName = _playerNameById[playerId];
    delete _playerNameById[playerId];
    delete _playerIdByName[playerName];
    delete _playerData[playerId];
  };

  globalThis.SC = _SC;
  void 0;
}

SC.command.scout = {
  // default
  players: "me",
  enabled: false,
  delay: 0,
  interval: 0,

  // [scout] [players] [enabled] [delay] [interval]
  _cmd: (userId, tokens) => {
    const _default = SC.command.scout;

    const resolvedIds = SC.resolveNames(userId, (tokens[1] === undefined || tokens[1] === ".") ? _default.players : tokens[1]);
    if (SC.playersTokenError("scout", userId, resolvedIds)) {
      return "Error";
    }

    const enabled = !!((tokens[2] === undefined || tokens[2] === ".") ? _default.enabled : tokens[2]);

    const delay = ((tokens[3] === undefined || tokens[3] === ".") ? _default.delay : tokens[3]) | 0;

    const interval = ((tokens[4] === undefined || tokens[4] === ".") ? _default.interval : tokens[4]) | 0;

    const groupId = "SC" + (++SC._operationId);
    SC.command.scout._run(resolvedIds[0], enabled, delay, interval, groupId);
    return groupId;
  },
  _run: (playerIds, enabled, delay, interval, groupId) => {
    const _playerData = SC._playerData;
    let i = 0, n = playerIds.length;
    if (!delay && !interval) {
      while (i < n) {
        _playerData[playerIds[i]].showSCout = enabled;
        i++;
      }
    } else if (interval) {
      TS.run(function repeater() {
        if (i >= n) {
          return;
        }
        const playerId = playerIds[i];
        if (api.checkValid(playerId)) {
          _playerData[playerId].showSCout = enabled;
        }
        i++;
        TS.run(repeater, interval, groupId);
      }, delay, groupId);
    } else {
      TS.run(() => {
        while (i < n) {
          const playerId = playerIds[i];
          if (api.checkValid(playerId)) {
            _playerData[playerId].showSCout = enabled;
          }
          i++;
        }
      }, delay, groupId);
    }
  },
};
void 0;

SC.command.cancel = {
  // default
  delay: 0,
  
  // [cancel] [commandGroupId] [delay]
  _cmd: (userId, tokens) => {
    const _default = SC.command.cancel;

    let commandGroupId = (tokens[1] === undefined || tokens[1] === ".") ? SC._lastCommandGroupId : tokens[1];

    const delay = (tokens[2] === undefined || tokens[2] === ".") ? _default.delay : tokens[2];

    const groupId = "SC" + (++SC._operationId);
    SC.command.cancel._run(commandGroupId, delay, groupId);
    return groupId;
  },
  _run: (commandGroupId, delay, groupId) => {
    if (!delay) {
      TS.stop(commandGroupId);
    } else {
      TS.run(() => { TS.stop(commandGroupId); }, delay, groupId);
    }
  },
};
void 0;

SC.command.kick = {
  // default
  players: "",
  message: "Server Console: You were kicked.",
  delay: 0,
  interval: 0,
  
  // [kick] [players] [message] [delay] [interval]
  _cmd: (userId, tokens) => {
    const _default = SC.command.kick;

    const resolvedIds = SC.resolveNames(userId, (tokens[1] === undefined || tokens[1] === ".") ? _default.players : tokens[1]);
    if (SC.playersTokenError("kick", userId, resolvedIds)) {
      return "Error";
    }

    const message = (tokens[2] === undefined || tokens[2] === ".") ? _default.message : tokens[2];

    const delay = ((tokens[3] === undefined || tokens[3] === ".") ? _default.delay : tokens[3]) | 0;

    const interval = ((tokens[4] === undefined || tokens[4] === ".") ? _default.interval : tokens[4]) | 0;

    const groupId = "SC" + (++SC._operationId);
    SC.command.kick._run(resolvedIds[0], message, delay, interval, groupId);
    return groupId;
  },
  _run: (playerIds, message, delay, interval, groupId) => {
    let i = 0, n = playerIds.length;
    if (!delay && !interval) {
      while (i < n) {
        api.kickPlayer(playerIds[i], message);
        i++;
      }
    } else if (interval) {
      TS.run(function repeater() {
        if (i >= n) {
          return;
        }
        const playerId = playerIds[i];
        if (api.checkValid(playerId)) {
          api.kickPlayer(playerId, message);
        }
        i++;
        TS.run(repeater, interval, groupId);
      }, delay, groupId);
    } else {
      TS.run(() => {
        while (i < n) {
          const playerId = playerIds[i];
          if (api.checkValid(playerId)) {
            api.kickPlayer(playerId, message);
          }
          i++;
        }
      }, delay, groupId);
    }
  },
};
void 0;

SC.command.give = {
  // default
  players: "me",
  item: "",
  amount: 1,
  delay: 0,
  interval: 0,
  
  // [give] [players] [item] [amount] [delay] [interval]
  _cmd: (userId, tokens) => {
    const _default = SC.command.give;

    const resolvedIds = SC.resolveNames(userId, (tokens[1] === undefined || tokens[1] === ".") ? _default.players : tokens[1]);
    if (SC.playersTokenError("give", userId, resolvedIds)) {
      return "Error";
    }

    let itemName = (tokens[2] === undefined || tokens[2] === ".") ? _default.item : tokens[2];
    try {
      itemName = api.getInitialItemMetadata(itemName).name;
    } catch {
      api.sendMessage(userId, "Server Console: /give: Invalid item: " + itemName, { color: "#fcd373" });
      return "Error";
    }

    const amount = ((tokens[3] === undefined || tokens[3] === ".") ? _default.amount : tokens[3]) | 0;
    if (amount <= 0) {
      api.sendMessage(userId, "Server Console: /give: Invalid amount: " + amount, { color: "#fcd373" });
      return "Error";
    }

    const delay = ((tokens[4] === undefined || tokens[4] === ".") ? _default.delay : tokens[4]) | 0;

    const interval = ((tokens[5] === undefined || tokens[5] === ".") ? _default.interval : tokens[5]) | 0;

    const groupId = "SC" + (++SC._operationId);
    SC.command.give._run(resolvedIds[0], itemName, amount, delay, interval, groupId);
    return groupId;
  },
  _run: (playerIds, itemName, amount, delay, interval, groupId) => {
    let i = 0, n = playerIds.length;
    if (!delay && !interval) {
      while (i < n) {
        api.giveItem(playerIds[i], itemName, amount);
        i++;
      }
    } else if (interval) {
      TS.run(function repeater() {
        if (i >= n) {
          return;
        }
        const playerId = playerIds[i];
        if (api.checkValid(playerId)) {
          api.giveItem(playerId, itemName, amount);
        }
        i++;
        TS.run(repeater, interval, groupId);
      }, delay, groupId);
    } else {
      TS.run(() => {
        while (i < n) {
          const playerId = playerIds[i];
          if (api.checkValid(playerId)) {
            api.giveItem(playerId, itemName, amount);
          }
          i++;
        }
      }, delay, groupId);
    }
  },
};
void 0;

Object.seal(SC);
void 0;

