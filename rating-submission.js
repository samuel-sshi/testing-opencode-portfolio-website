(() => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ROOM = /^[A-Z0-9]{8}$/;
  const integer = (value, min = 0) => Number.isInteger(value) && value >= min;

  function create({ matchId, roomCode, players } = {}) {
    if (!UUID.test(String(matchId)) || !ROOM.test(String(roomCode)) || !Array.isArray(players)) return null;
    const finishers = players.filter((player) => player?.finished === true && UUID.test(String(player.profileId))
      && integer(player.score) && integer(player.answered) && integer(player.elapsed));
    if (finishers.length < 2 || new Set(finishers.map((player) => player.profileId)).size !== finishers.length) return null;
    const ordered = [...finishers].sort((a, b) => b.score - a.score || b.answered - a.answered || a.elapsed - b.elapsed || a.profileId.localeCompare(b.profileId));
    let last = null;
    return {
      p_match_id: matchId,
      p_room_code: roomCode,
      p_participants: ordered.map((player, index) => {
        const key = `${player.score}|${player.answered}|${player.elapsed}`;
        if (key !== last) last = key;
        const placement = ordered.findIndex((candidate) => `${candidate.score}|${candidate.answered}|${candidate.elapsed}` === key) + 1;
        return { profile_id: player.profileId, placement, score: player.score, answered: player.answered, elapsed_seconds: player.elapsed };
      })
    };
  }

  window.FlagQuizRatingSubmission = { create };
})();
