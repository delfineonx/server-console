// ---------- SETUP ----------

tick = () => {
  PT.tick();
  SC.tick();
  TS.tick();
  // ...
};

PT.join = (playerId, cache) => {
  SC.onPlayerJoin(playerId);
  // other interruption-safe logic

  // ----- EXAMPLE -----
  SC.perms.setRank(api.ownerDbId, "owner");
};

PT.leave = (playerId, cache) => {
  SC.onPlayerLeave(playerId);
  // other interruption-safe logic
};

SC.install.fn = (cache) => {
  // interruption safe logic to run once for everyone

  // ----- EXAMPLE -----
  SC.ranks.create("owner", [
    "console", "cmdout", "cancel",
    "kick", "give", "take",
    "hp", "xp",
    "sethp", "setsh", "setxp",
    "setmaxhp", "setmaxxp", "perlvlxp",
    "tppos", "tp",
  ]);
};
// SC.install.cache = {}; // optional
SC.install.done = false;

onPlayerJoin = (playerId) => {
  PT.onPlayerJoin(playerId);
  // ...
};
onPlayerLeave = (playerId) => {
  PT.onPlayerLeave(playerId);
  // ...
};
playerCommand = (playerId, command) => {
  const cmdout = SC.playerCommand(playerId, command);
  if (cmdout !== null) {
    return true;
  }
  // ...
};
