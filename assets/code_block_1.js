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

  void 0;
}

