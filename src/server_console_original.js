// Copyright (c) 2025 delfineonx
// This product includes "Server Console" created by delfineonx.
// This product includes "Player Tracker" created by delfineonx.
// This product includes "Task Scheduler" created by delfineonx, chmod, FrostyCaveman.
// Licensed under the Apache License, Version 2.0.

// Task Scheduler
{
  const _TS = {
    currentTick: 0,
    run: null,
    stop: null,
    isGroupActive: null,
    cancel: null,
    isTaskActive: null,
    getGroupId: null,
    tick: null,
  };

  const _defaultGroupId = "__default__";
  let _tasks = Object.create(null);
  let _groupCount = Object.create(null);
  let _groupStop = Object.create(null);
  let _operationId = 1;
  let _currentTick = 0;
  let _activeIndex = 0;
  let _tickState = 1;
  let _taskState = 1;
  let _isTaskActive = false;
  let _isLastTaskInGroup = true;

  _TS.run = (task, delay, groupId) => {
    groupId ??= _defaultGroupId;
    delay = ((delay | 0) * 0.02) | 0;
    delay = delay & ~(delay >> 31); // delay > 0 ? delay : 0
    const targetTick = _currentTick + delay + (!delay & _tickState);
    let queue = _tasks[targetTick];
    let count = _groupCount[groupId];
    let index = 0;
    if (!queue && delay) {
      if (count === undefined) {
        count = 1;
        _groupStop[groupId] = 1;
      } else if (~count & 1) {
        count++;
      }
      _tasks[targetTick] = [[task], [groupId], [++_operationId]];
      _groupCount[groupId] = count + 2;
    } else if (queue && delay) {
      if (count === undefined) {
        count = 1;
        _groupStop[groupId] = 1;
      } else if (~count & 1) {
        count++;
      }
      index = queue[2].length;
      queue[0][index] = task;
      queue[1][index] = groupId;
      queue[2][index] = ++_operationId;
      _groupCount[groupId] = count + 2;
    } else if (!_tickState) {
      index = -1;
      task();
    } else if (!queue && !delay) {
      if (count === undefined) {
        count = 1;
        _groupStop[groupId] = 1;
      } else if (~count & 1) {
        count++;
      }
      queue = _tasks[targetTick] = [[task], [groupId], [++_operationId]];
      _groupCount[groupId] = count + 2;
      try {
        task();
        queue[2][0] = 1;
      } catch (error) {
        queue[2][0] = 1;
        api.broadcastMessage("Scheduler [" + groupId + "]: " + error.name + ": " + error.message + ".", { color: "#ff9d87" });
      }
    } else {
      if (count === undefined) {
        count = 1;
        _groupStop[groupId] = 1;
      } else if (~count & 1) {
        count++;
      }
      index = queue[2].length;
      queue[0][index] = task;
      queue[1][index] = groupId;
      queue[2][index] = ++_operationId;
      _groupCount[groupId] = count + 2;
      try {
        task();
        queue[2][index] = 1;
      } catch (error) {
        queue[2][index] = 1;
        api.broadcastMessage("Scheduler [" + groupId + "]: " + error.name + ": " + error.message + ".", { color: "#ff9d87" });
      }
    }
    return [targetTick, index];
  };

  _TS.stop = (groupId) => {
    groupId ??= _defaultGroupId;
    if (_groupCount[groupId] & 1) {
      _groupCount[groupId]--;
      _groupStop[groupId] = ++_operationId;
    }
  };

  _TS.isGroupActive = (groupId) => {
    groupId ??= _defaultGroupId;
    return !!(_groupCount[groupId] & 1);
  };

  _TS.cancel = (taskId) => {
    const queue = _tasks[taskId[0]];
    const index = taskId[1] >>> 0;
    if (!queue || index >= queue[2].length) {
      return;
    }
    queue[2][index] = 1;
  };

  _TS.isTaskActive = (taskId) => {
    const queue = _tasks[taskId[0]];
    const index = taskId[1] >>> 0;
    if (!queue || index >= queue[2].length) {
      return false;
    }
    return (queue[2][index] > _groupStop[queue[1][index]]);
  };

  _TS.getGroupId = (taskId) => {
    const queue = _tasks[taskId[0]];
    const index = taskId[1] >>> 0;
    if (!queue || index >= queue[1].length) {
      return null;
    }
    return queue[1][index];
  };

  _TS.tick = () => {
    const queue = _tasks[_TS.currentTick = (_currentTick += _tickState)];
    _tickState = 0;
    if (queue) {
      const taskList = queue[0];
      const groupIdList = queue[1];
      const operationIdList = queue[2];
      let groupId, operationId;
      do {
        try {
          while (operationId = operationIdList[_activeIndex]) {
            groupId = groupIdList[_activeIndex];
            if (_taskState) {
              _isTaskActive = (operationId > _groupStop[groupId]);
              _isLastTaskInGroup = ((_groupCount[groupId] -= 2) < 2);
            }
            _taskState = 0;
            if (_isLastTaskInGroup) {
              delete _groupCount[groupId];
              delete _groupStop[groupId];
              _isLastTaskInGroup = false;
            }
            if (_isTaskActive) {
              taskList[_activeIndex]();
            }
            _taskState = 1;
            _activeIndex++;
          }
          delete _tasks[_currentTick];
          _activeIndex = 0;
          break;
        } catch (error) {
          _taskState = 1;
          _activeIndex++;
          api.broadcastMessage("Scheduler [" + groupId + "]: " + error.name + ": " + error.message + ".", { color: "#ff9d87" });
        }
      } while (true);
    }
    _tickState = 1
  };

  Object.seal(_TS);
  globalThis.TS = _TS;

  void 0;
}

// Player Tracker
{
  const _PT = {
    scanIntervalTicks: 20,
    maxDequeuePerTick: 40,
    join: () => { },
    leave: () => { },
    forceScan: null,
    checkValid: null,
    getPlayerIds: null,
    getPlayerIdsUnsafe: null,
    onPlayerJoin: null,
    onPlayerLeave: null,
    tick: null,
  };

  // playerId -> [joinStatus, joinCache, leaveStatus, leaveCache, seenGenerationId]
  const _stateById = Object.create(null);
  const _presentIds = [];
  const _presentById = _PT.checkValid = Object.create(null);
  let _generationId = 1;
  let _scanCountdown = 0;

  _PT.getPlayerIds = () => _presentIds.slice();

  _PT.getPlayerIdsUnsafe = () => _presentIds;

  _PT.forceScan = () => {
    _scanCountdown = 0;
  };

  _PT.onPlayerJoin = (playerId) => {
    const state = _stateById[playerId] = [1, {}, 1, {}, _generationId + 1];
    if (!_presentById[playerId]) {
      const index = _presentIds.length;
      _presentIds[index] = playerId;
      _presentById[playerId] = index + 1;
    }
    if (state[0]) {
      try {
        _PT.join(playerId, state[1]);
        state[0] = 0;
      } catch (error) {
        state[0] = 0;
        api.broadcastMessage("Player Tracker: Join handler error: " + error.name + ": " + error.message, { color: "#ff9d87" });
      }
    }
  };

  _PT.onPlayerLeave = (playerId) => {
    const mapIndex = _presentById[playerId];
    const state = _stateById[playerId];
    if (!mapIndex) {
      if (state) {
        delete _stateById[playerId];
      }
      return;
    }
    if (state[2]) {
      try {
        _PT.leave(playerId, state[3]);
        state[2] = 0;
      } catch (error) {
        state[2] = 0;
        api.broadcastMessage("Player Tracker: Leave handler error: " + error.name + ": " + error.message, { color: "#ff9d87" });
      }
    }
    const lastIndex = _presentIds.length - 1;
    const lastPlayerId = _presentIds[lastIndex];
    if (lastPlayerId !== playerId) {
      _presentIds[mapIndex - 1] = lastPlayerId;
      _presentById[lastPlayerId] = mapIndex;
    }
    _presentIds.length = lastIndex;
    delete _presentById[playerId];
    delete _stateById[playerId];
  };

  _PT.tick = () => {
    if (_scanCountdown > 0) {
      _scanCountdown--;
      return;
    }
    const nextGenerationId = _generationId + 1;
    const newPlayerIds = api.getPlayerIds();
    const scanLength = newPlayerIds.length;
    let scanIndex = 0;
    while (scanIndex < scanLength) {
      const playerId = newPlayerIds[scanIndex];
      let state = _stateById[playerId];
      if (!state) {
        state = _stateById[playerId] = [1, {}, 1, {}, 0];
      }
      if (!_presentById[playerId]) {
        const index = _presentIds.length;
        _presentIds[index] = playerId;
        _presentById[playerId] = index + 1;
      }
      if (!state[2]) {
        state[0] = 1;
        state[1] = {};
        state[2] = 1;
        state[3] = {};
      }
      state[4] = nextGenerationId;
      scanIndex++;
    }
    let budget = _PT.maxDequeuePerTick;
    let presentIndex = 0;
    while (presentIndex < _presentIds.length && budget > 0) {
      const playerId = _presentIds[presentIndex];
      const state = _stateById[playerId];
      if (state[4] === nextGenerationId) {
        if (state[0]) {
          try {
            _PT.join(playerId, state[1]);
            state[0] = 0;
          } catch (error) {
            state[0] = 0;
            api.broadcastMessage("Player Tracker: Join handler error: " + error.name + ": " + error.message, { color: "#ff9d87" });
          }
          budget--;
        }
        presentIndex++;
        continue;
      }
      if (state[2]) {
        try {
          _PT.leave(playerId, state[3]);
          state[2] = 0;
        } catch (error) {
          state[2] = 0;
          api.broadcastMessage("Player Tracker: Leave handler error: " + error.name + ": " + error.message, { color: "#ff9d87" });
        }
      }
      const lastIndex = _presentIds.length - 1;
      const lastPlayerId = _presentIds[lastIndex];
      if (lastIndex !== presentIndex) {
        _presentIds[presentIndex] = lastPlayerId;
        _presentById[lastPlayerId] = presentIndex + 1;
      }
      _presentIds.length = lastIndex;
      delete _presentById[playerId];
      delete _stateById[playerId];
      budget--;
    }
    _generationId = nextGenerationId;
    _scanCountdown = (_PT.scanIntervalTicks - 1) * +(budget > 0);
  };

  Object.seal(_PT);
  globalThis.PT = _PT;
}

// Server Console (core)
{
  const _SC = {
    establish: null,
    install: {
      fn: () => { },
      done: true,
      cache: {},
    },

    ranks: {
      create: null,
      delete: null,
      exist: null,
      get: null,
      add: null,
      remove: null,
    },

    perms: {
      getRank: null,
      setRank: null,
      has: null,
      get: null,
      add: null,
      remove: null,
      clear: null,
    },

    tick: null,
    onPlayerJoin: null,
    onPlayerLeave: null,
    playerCommand: null,

    commands: Object.create(null),

    // "id" -> "Name"
    playerNameById: Object.create(null),
    // "Name" -> "id"
    playerIdByName: Object.create(null),
    // "id" -> "DbId"
    playerDbIdById: Object.create(null),
    // "DbId" -> "id"
    playerIdByDbId: Object.create(null),

    parse: null,
    split: null,
    resolveNames: null,
    playersTokenError: null,

    _playerDataById: Object.create(null),
    _operationId: 0,
  };

  const _commands = _SC.commands;
  const _nameById = _SC.playerNameById;
  const _idByName = _SC.playerIdByName;
  const _dbidById = _SC.playerDbIdById;
  const _idByDbId = _SC.playerIdByDbId;

  const _dataById = _SC._playerDataById;
  const _maskByRank = Object.create(null);
  let _nameByMaskIndex = [];

  const _install = _SC.install;
  const _ranks = _SC.ranks;
  const _perms = _SC.perms;

  let _maskIndex = 0;
  let _established = true;

  _SC.establish = () => {
    _nameByMaskIndex.length = 0;
    _maskIndex = 0;
    _established = false;
  };

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
  const _resolvePlayerNames = _SC.resolveNames = (userId, str) => {
    const tokens = _split(str);

    const include = {}; // id -> 1
    const exclude = {}; // id -> 1
    let includeAny = 0, includeAll = 0, excludeAny = 0, excludeAll = 0;

    const targets = [];
    const unspecified = [];
    const invalid = [];

    const playerIds = globalThis.PT.getPlayerIdsUnsafe();
    const numPlayers = playerIds.length;

    for (let index = 0; index < tokens.length; index++) {
      let token = tokens[index];

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

      let matchId = _idByName[token];
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
      for (let i = 0; i < numPlayers; i++) {
        const id = playerIds[i];
        if (_nameById[id].indexOf(token) !== -1) {
          if (++matchCount > 1) break;
          matchId = id;
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
        for (let i = 0; i < numPlayers; i++) {
          const id = playerIds[i];
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
  const _playersTokenError = _SC.playersTokenError = (commandName, userId, resolvedIds) => {
    if (resolvedIds[1].length > 0) {
      api.sendMessage(userId, "Server Console: \"/" + commandName + "\": Multiple players: " + resolvedIds[1].join(", "), { color: "#fcd373" });
    }
    if (resolvedIds[2].length > 0) {
      api.sendMessage(userId, "Server Console: \"/" + commandName + "\": Invalid players: " + resolvedIds[2].join(", "), { color: "#fcd373" });
    }
    if (resolvedIds[0].length === 0) {
      api.sendMessage(userId, "Server Console: \"/" + commandName + "\": No players found.", { color: "#fcd373" });
      return true;
    }
    return false;
  };

  const _maskToNames = (perms) => {
    const out = [];
    for (let word = 0; word < 2; word++) {
      let mask = perms[word] >>> 0;
      while (mask) {
        const lsb = mask & -mask;
        const bit = 31 - Math.clz32(lsb);
        out.push(_nameByMaskIndex[(word << 5) + bit]);
        mask ^= lsb;
      }
    }
    return out;
  };

  _ranks.create = (rankName, commandNames) => {
    const perms = [0, 0];
    for (let i = 0, n = commandNames.length; i < n; i++) {
      const command = _commands[commandNames[i]?.toLowerCase()];
      if (command) {
        perms[command._word] |= command._bit;
      }
    }
    _maskByRank[rankName] = perms;
  };
  _ranks.delete = (rankName) => {
    if (_maskByRank[rankName]) {
      delete _maskByRank[rankName];
      return true;
    }
    return false;
  };
  _ranks.exist = (rankName) => {
    return !!_maskByRank[rankName];
  };
  _ranks.get = (rankName) => {
    const perms = _maskByRank[rankName];
    if (!perms) {
      return null;
    }
    return _maskToNames(perms);
  };
  _ranks.add = (rankName, commandNames) => {
    let perms = _maskByRank[rankName];
    if (!perms) {
      return false;
    }
    perms = perms.slice();
    for (let i = 0, n = commandNames.length; i < n; i++) {
      const command = _commands[commandNames[i]?.toLowerCase()];
      if (command) {
        perms[command._word] |= command._bit;
      }
    }
    _maskByRank[rankName] = perms;
    return true;
  };
  _ranks.remove = (rankName, commandNames) => {
    let perms = _maskByRank[rankName];
    if (!perms) {
      return false;
    }
    perms = perms.slice();
    for (let i = 0, n = commandNames.length; i < n; i++) {
      const command = _commands[commandNames[i]?.toLowerCase()];
      if (command) {
        perms[command._word] &= ~command._bit;
      }
    }
    _maskByRank[rankName] = perms;
    return true;
  };

  _perms.getRank = (playerDbId) => {
    const playerId = _idByDbId[playerDbId];
    if (!playerId) {
      return null;
    }
    return _dataById[playerId].rank;
  };
  _perms.setRank = (playerDbId, rankName) => {
    const playerId = _idByDbId[playerDbId];
    const rankPerms = _maskByRank[rankName];
    if (!playerId || !rankPerms) {
      return false;
    }
    const data = _dataById[playerId];
    data.rank = rankName;
    data.perms = rankPerms;
    return true;
  };
  _perms.has = (playerDbId, commandName) => {
    const playerId = _idByDbId[playerDbId];
    const command = _commands[commandName?.toLowerCase()];
    if (!playerId || !command) {
      return null;
    }
    return !!(_dataById[playerId].perms[command._word] & command._bit);
  };
  _perms.get = (playerDbId) => {
    const playerId = _idByDbId[playerDbId];
    if (!playerId) {
      return null;
    }
    return _maskToNames(_dataById[playerId].perms);
  };
  _perms.add = (playerDbId, commandNames) => {
    const playerId = _idByDbId[playerDbId];
    if (!playerId) {
      return false;
    }
    const perms = _dataById[playerId].perms.slice();
    for (let i = 0, n = commandNames.length; i < n; i++) {
      const command = _commands[commandNames[i]?.toLowerCase()];
      if (command) {
        perms[command._word] |= command._bit;
      }
    }
    _dataById[playerId].perms = perms;
    return true;
  };
  _perms.remove = (playerDbId, commandNames) => {
    const playerId = _idByDbId[playerDbId];
    if (!playerId) {
      return false;
    }
    const perms = _dataById[playerId].perms.slice();
    for (let i = 0, n = commandNames.length; i < n; i++) {
      const command = _commands[commandNames[i]?.toLowerCase()];
      if (command) {
        perms[command._word] &= ~command._bit;
      }
    }
    _dataById[playerId].perms = perms;
    return true;
  };
  _perms.clear = (playerDbId) => {
    const playerId = _idByDbId[playerDbId];
    if (!playerId) {
      return false;
    }
    _dataById[playerId].perms = [0, 0];
    return true;
  };

  _commands.cmdout = {
    // default
    players: "me",
    enabled: false,
    delay: 0,
    interval: 0,

    // [cmdout] [players] [enabled] [delay] [interval]
    _cmd: function (userId, tokens) {
      const command = this;

      const resolvedIds = _resolvePlayerNames(userId, (tokens[1] === undefined || tokens[1] === ".") ? command.players : tokens[1]);
      if (_playersTokenError("cmdout", userId, resolvedIds)) {
        return "Error";
      }

      const enabled = ((tokens[2] === undefined || tokens[2] === ".") ? command.enabled : (tokens[2] !== "false" && tokens[2] !== "0"));

      const delay = ((tokens[3] === undefined || tokens[3] === ".") ? command.delay : tokens[3]) | 0;

      const interval = ((tokens[4] === undefined || tokens[4] === ".") ? command.interval : tokens[4]) | 0;

      const groupId = "SC" + (++_SC._operationId);
      command._run(resolvedIds[0], enabled, delay, interval, groupId);
      return groupId;
    },
    _run: function (targetIds, enabled, delay, interval, groupId) {
      const _TS = globalThis.TS;
      const _PT = globalThis.PT;
      const _data = _dataById;
      let i = 0, n = targetIds.length;
      if (!delay && !interval) {
        while (i < n) {
          _data[targetIds[i]].showCmdOut = enabled;
          i++;
        }
      } else if (interval) {
        _TS.run(function repeater() {
          if (i >= n) {
            return;
          }
          const playerId = targetIds[i];
          if (_PT.checkValid[playerId]) {
            _data[playerId].showCmdOut = enabled;
          }
          i++;
          _TS.run(repeater, interval, groupId);
        }, delay, groupId);
      } else {
        _TS.run(() => {
          while (i < n) {
            const playerId = targetIds[i];
            if (_PT.checkValid[playerId]) {
              _data[playerId].showCmdOut = enabled;
            }
            i++;
          }
        }, delay, groupId);
      }
    },
  };
  _commands.cancel = {
    // default
    delay: 0,

    // [cancel] [commandGroupId] [delay]
    _cmd: function (userId, tokens) {
      const command = this;

      let commandGroupId = (tokens[1] === undefined || tokens[1] === ".") ? _dataById[userId].lastCmdGroupId : tokens[1];

      const delay = (tokens[2] === undefined || tokens[2] === ".") ? command.delay : tokens[2];

      const groupId = "SC" + (++_SC._operationId);
      command._run(commandGroupId, delay, groupId);
      return groupId;
    },
    _run: function (commandGroupId, delay, groupId) {
      const _TS = globalThis.TS;
      if (!delay) {
        _TS.stop(commandGroupId);
      } else {
        _TS.run(() => { _TS.stop(commandGroupId); }, delay, groupId);
      }
    },
  };

  _SC.tick = () => {
    if (!_established) {
      for (const name in _commands) {
        const command = _commands[name];
        if (command._word == null) {
          command._word = (_maskIndex >>> 5);
          command._bit = (1 << (_maskIndex & 31)) >>> 0;
          _nameByMaskIndex[_maskIndex] = name;
          _maskIndex++;
        }
      }
      _established = true;
    }
    if (!_install.done) {
      try {
        _install.fn(_install.cache);
        _install.done = true;
      } catch (error) {
        _install.done = true;
        api.broadcastMessage("Server Console: Installation error: " + error.name + ": " + error.message, { color: "#ff9d87" });
      }
    }
  };
  _SC.onPlayerJoin = (playerId) => {
    const name = api.getEntityName(playerId);
    const dbid = api.getPlayerDbId(playerId);
    _nameById[playerId] = name;
    _idByName[name] = playerId;
    _dbidById[playerId] = dbid;
    _idByDbId[dbid] = playerId;
    _dataById[playerId] = {
      showCmdOut: false,
      lastCmdGroupId: "SC0",
      rank: null,
      perms: [0, 0],
    };
  };
  _SC.onPlayerLeave = (playerId) => {
    const name = _nameById[playerId];
    const dbid = _dbidById[playerId];
    delete _nameById[playerId];
    delete _idByName[name];
    delete _dbidById[playerId];
    delete _idByDbId[dbid];
    delete _dataById[playerId];
  };
  _SC.playerCommand = (userId, input) => {
    let tokens = _parse(input);
    const name = tokens[0]?.toLowerCase();
    const command = _commands[name];
    const data = _dataById[userId];
    let out = null;
    if (command) {
      if (data.perms[command._word] & command._bit) {
        out = command._cmd(userId, tokens);
        if (out !== "Error") {
          data.lastCmdGroupId = out;
        }
      } else {
        out = "AccessDenied";
        api.sendMessage(userId, "Server Console: \"/" + name + "\": Access denied.");
      }
    }
    if (data.showCmdOut) {
      api.sendMessage(userId, out);
    }
    return out;
  };

  globalThis.SC = _SC;
  void 0;
}

SC.commands.kick = {
  // default
  players: "",
  message: "Server Console: You were kicked.",
  delay: 0,
  interval: 0,

  // [kick] [players] [message] [delay] [interval]
  _cmd: function (userId, tokens) {
    const command = this;

    const resolvedIds = SC.resolveNames(userId, (tokens[1] === undefined || tokens[1] === ".") ? command.players : tokens[1]);
    if (SC.playersTokenError("kick", userId, resolvedIds)) {
      return "Error";
    }

    const message = (tokens[2] === undefined || tokens[2] === ".") ? command.message : tokens[2];

    const delay = ((tokens[3] === undefined || tokens[3] === ".") ? command.delay : tokens[3]) | 0;

    const interval = ((tokens[4] === undefined || tokens[4] === ".") ? command.interval : tokens[4]) | 0;

    const groupId = "SC" + (++SC._operationId);
    command._run(resolvedIds[0], message, delay, interval, groupId);
    return groupId;
  },
  _run: function (targetIds, message, delay, interval, groupId) {
    let i = 0, n = targetIds.length;
    if (!delay && !interval) {
      while (i < n) {
        api.kickPlayer(targetIds[i], message);
        i++;
      }
    } else if (interval) {
      TS.run(function repeater() {
        if (i >= n) {
          return;
        }
        const playerId = targetIds[i];
        if (PT.checkValid[playerId]) {
          api.kickPlayer(playerId, message);
        }
        i++;
        TS.run(repeater, interval, groupId);
      }, delay, groupId);
    } else {
      TS.run(() => {
        while (i < n) {
          const playerId = targetIds[i];
          if (PT.checkValid[playerId]) {
            api.kickPlayer(playerId, message);
          }
          i++;
        }
      }, delay, groupId);
    }
  },
};
void 0;

SC.commands.give = {
  // default
  players: "me",
  item: "",
  amount: 1,
  delay: 0,
  interval: 0,

  // [give] [players] [item] [amount] [delay] [interval]
  _cmd: function (userId, tokens) {
    const command = this;

    const resolvedIds = SC.resolveNames(userId, (tokens[1] === undefined || tokens[1] === ".") ? command.players : tokens[1]);
    if (SC.playersTokenError("give", userId, resolvedIds)) {
      return "Error";
    }

    let itemName = (tokens[2] === undefined || tokens[2] === ".") ? command.item : tokens[2];
    try {
      itemName = api.getInitialItemMetadata(itemName).name;
    } catch {
      api.sendMessage(userId, "Server Console: \"/give\": Invalid item: " + itemName, { color: "#fcd373" });
      return "Error";
    }

    const amount = ((tokens[3] === undefined || tokens[3] === ".") ? command.amount : tokens[3]) | 0;
    if (amount <= 0) {
      api.sendMessage(userId, "Server Console: \"/give\": Invalid amount: " + amount, { color: "#fcd373" });
      return "Error";
    }

    const delay = ((tokens[4] === undefined || tokens[4] === ".") ? command.delay : tokens[4]) | 0;

    const interval = ((tokens[5] === undefined || tokens[5] === ".") ? command.interval : tokens[5]) | 0;

    const groupId = "SC" + (++SC._operationId);
    command._run(resolvedIds[0], itemName, amount, delay, interval, groupId);
    return groupId;
  },
  _run: (targetIds, itemName, amount, delay, interval, groupId) => {
    let i = 0, n = targetIds.length;
    if (!delay && !interval) {
      while (i < n) {
        api.giveItem(targetIds[i], itemName, amount);
        i++;
      }
    } else if (interval) {
      TS.run(function repeater() {
        if (i >= n) {
          return;
        }
        const playerId = targetIds[i];
        if (PT.checkValid[playerId]) {
          api.giveItem(playerId, itemName, amount);
        }
        i++;
        TS.run(repeater, interval, groupId);
      }, delay, groupId);
    } else {
      TS.run(() => {
        while (i < n) {
          const playerId = targetIds[i];
          if (PT.checkValid[playerId]) {
            api.giveItem(playerId, itemName, amount);
          }
          i++;
        }
      }, delay, groupId);
    }
  },
};
void 0;

SC.establish();

Object.seal(SC);
void 0;

// -------------------- SETUP --------------------

tick = () => {
  PT.tick();
  SC.tick();
  TS.tick();
  // other logic
};

PT.join = (playerId, cache) => {
  SC.onPlayerJoin(playerId);
  // other interruption-safe logic
};

PT.leave = (playerId, cache) => {
  SC.onPlayerLeave(playerId);
  // other interruption-safe logic
};

SC.install.fn = (cache) => {
  // interruption safe logic to run once
};
// SC.install.cache = {}; // optional
SC.install.done = false;

onPlayerJoin = (playerId) => {
  PT.onPlayerJoin(playerId);
  // other logic
};
onPlayerLeave = (playerId) => {
  PT.onPlayerLeave(playerId);
  // other logic
};
playerCommand = (playerId, command) => {
  const cmdout = SC.playerCommand(playerId, command);
  if (cmdout !== null) {
    return true;
  }
  // other logic
};
