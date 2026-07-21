const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
const sb = window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
const TOTAL_FLAGS = 20;
const ROOM_CODE_LENGTH = 8;
const COUNTRY_DATA = `Afghanistan|AF;Albania|AL;Algeria|DZ;Andorra|AD;Angola|AO;Antigua and Barbuda|AG;Argentina|AR;Armenia|AM;Australia|AU;Austria|AT;Azerbaijan|AZ;Bahamas|BS;Bahrain|BH;Bangladesh|BD;Barbados|BB;Belarus|BY;Belgium|BE;Belize|BZ;Benin|BJ;Bhutan|BT;Bolivia|BO;Bosnia and Herzegovina|BA;Botswana|BW;Brazil|BR;Brunei|BN;Bulgaria|BG;Burkina Faso|BF;Burundi|BI;Cape Verde|CV;Cambodia|KH;Cameroon|CM;Canada|CA;Central African Republic|CF;Chad|TD;Chile|CL;China|CN;Colombia|CO;Comoros|KM;Congo|CG;Costa Rica|CR;Croatia|HR;Cuba|CU;Cyprus|CY;Czech Republic|CZ;Denmark|DK;Djibouti|DJ;Dominica|DM;Dominican Republic|DO;Ecuador|EC;Egypt|EG;El Salvador|SV;Equatorial Guinea|GQ;Eritrea|ER;Estonia|EE;Eswatini|SZ;Ethiopia|ET;Fiji|FJ;Finland|FI;France|FR;Gabon|GA;Gambia|GM;Georgia|GE;Germany|DE;Ghana|GH;Greece|GR;Grenada|GD;Guatemala|GT;Guinea|GN;Guinea-Bissau|GW;Guyana|GY;Haiti|HT;Honduras|HN;Hungary|HU;Iceland|IS;India|IN;Indonesia|ID;Iran|IR;Iraq|IQ;Ireland|IE;Israel|IL;Italy|IT;Ivory Coast|CI;Jamaica|JM;Japan|JP;Jordan|JO;Kazakhstan|KZ;Kenya|KE;Kiribati|KI;Kuwait|KW;Kyrgyzstan|KG;Laos|LA;Latvia|LV;Lebanon|LB;Lesotho|LS;Liberia|LR;Libya|LY;Liechtenstein|LI;Lithuania|LT;Luxembourg|LU;Madagascar|MG;Malawi|MW;Malaysia|MY;Maldives|MV;Mali|ML;Malta|MT;Marshall Islands|MH;Mauritania|MR;Mauritius|MU;Mexico|MX;Micronesia|FM;Moldova|MD;Monaco|MC;Mongolia|MN;Montenegro|ME;Morocco|MA;Mozambique|MZ;Myanmar|MM;Namibia|NA;Nauru|NR;Nepal|NP;Netherlands|NL;New Zealand|NZ;Nicaragua|NI;Niger|NE;Nigeria|NG;North Korea|KP;North Macedonia|MK;Norway|NO;Oman|OM;Pakistan|PK;Palau|PW;Panama|PA;Papua New Guinea|PG;Paraguay|PY;Peru|PE;Philippines|PH;Poland|PL;Portugal|PT;Qatar|QA;Romania|RO;Russia|RU;Rwanda|RW;Saint Kitts and Nevis|KN;Saint Lucia|LC;Saint Vincent and the Grenadines|VC;Samoa|WS;San Marino|SM;Sao Tome and Principe|ST;Saudi Arabia|SA;Senegal|SN;Serbia|RS;Seychelles|SC;Sierra Leone|SL;Singapore|SG;Slovakia|SK;Slovenia|SI;Solomon Islands|SB;Somalia|SO;South Africa|ZA;South Korea|KR;South Sudan|SS;Spain|ES;Sri Lanka|LK;Sudan|SD;Suriname|SR;Sweden|SE;Switzerland|CH;Syria|SY;Tajikistan|TJ;Tanzania|TZ;Thailand|TH;Timor-Leste|TL;Togo|TG;Tonga|TO;Trinidad and Tobago|TT;Tunisia|TN;Turkey|TR;Turkmenistan|TM;Tuvalu|TV;Uganda|UG;Ukraine|UA;United Arab Emirates|AE;United Kingdom|GB;United States|US;Uruguay|UY;Uzbekistan|UZ;Vanuatu|VU;Vatican City|VA;Venezuela|VE;Vietnam|VN;Yemen|YE;Zambia|ZM;Zimbabwe|ZW`;
const COUNTRIES = COUNTRY_DATA.split(';').map((row) => {
  const [name, code] = row.split('|');
  return { name, code, flag: `https://flagcdn.com/w320/${code.toLowerCase()}.png` };
});
const COUNTRY_BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

const state = {
  roomCode: '', playerName: '', clientId: crypto.randomUUID(), isHost: false,
  hostId: '', hostPublicKey: null, keyPair: null, publicKey: null,
  channel: null, roomStatus: 'lobby', pendingJoin: null, authorized: {},
  lastSeq: {}, sendSeq: 0, quiz: [], scoreboard: {}, index: 0,
  startedAt: 0, finished: false, answerLocked: false, timer: null,
  account: null, leaderboardPage: 1, leaderboardTotal: 0, matchId: null, ratingFinalized: false
};
const cryptoReady = createIdentity();
const $ = (id) => document.getElementById(id);
const show = (id) => {
  document.querySelectorAll('.screen').forEach((element) => element.classList.remove('active'));
  $(id).classList.add('active');
};
const cleanName = () => String(state.account?.username || '').trim().replace(/\s+/g, ' ').slice(0, 20);
const cleanCode = () => $('roomCodeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
const safeInt = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : min;
};
const formatTime = (seconds) => {
  const safe = safeInt(seconds, 0, 86400);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};
function escapeHtml(value) { const element = document.createElement('div'); element.textContent = String(value); return element.innerHTML; }
function accountCredentials() {
  const username = $('signupUsername').value.trim().toLowerCase();
  const password = $('signupPassword').value;
  if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new Error('Username must be 3–20 characters using letters, numbers, or underscores.');
  if (password.length < 8 || password.length > 72) throw new Error('Password must be 8–72 characters.');
  return { username, password };
}
function accountEmail(username) { return `${username}@players.countryflagquiz.app`; }
function setAuthBusy(busy) { $('signupBtn').disabled = busy; $('signinBtn').disabled = busy; }
async function requirePasswordOnlySignup() {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
    if (!response.ok) throw new Error('settings unavailable');
    const settings = await response.json();
    if (settings.mailer_autoconfirm !== true) throw new Error('Username-only sign-up requires email confirmation to be disabled in Supabase.');
  } catch (error) {
    if (String(error?.message || error).includes('Username-only sign-up')) throw error;
    throw new Error('Could not verify account configuration. Please try again.');
  }
}
function signupErrorMessage(error) {
  const message = String(error?.message || error || 'Could not create your account.');
  if (/already|registered|unique|duplicate/i.test(message)) return 'That username is already taken.';
  if (/invalid login|invalid credentials/i.test(message)) return 'Incorrect username or password.';
  return message;
}
function authenticatedUsername(user, fallback = '') {
  const username = String(user?.user_metadata?.username || fallback).trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new Error('Your account is missing a valid username.');
  return username;
}
function enterAccount(user, fallbackUsername = '') {
  const username = authenticatedUsername(user, fallbackUsername);
  state.account = { id: user.id, username };
  $('playerName').value = username;
  $('accountUsername').textContent = username;
  $('signupPassword').value = '';
  show('home');
}
async function signUp() {
  $('signupError').textContent = ''; $('signupMessage').textContent = ''; setAuthBusy(true);
  try {
    if (!sb) throw new Error('Account service is unavailable.');
    const { username, password } = accountCredentials();
    await requirePasswordOnlySignup();
    const { data, error } = await sb.auth.signUp({ email: accountEmail(username), password, options: { data: { username } } });
    if (error) throw error;
    if (!data?.session || !data.user) throw new Error('Username-only sign-up requires email confirmation to be disabled in Supabase.');
    enterAccount(data.user, username);
  } catch (error) { $('signupError').textContent = signupErrorMessage(error); }
  finally { setAuthBusy(false); }
}
async function signIn() {
  $('signupError').textContent = ''; $('signupMessage').textContent = ''; setAuthBusy(true);
  try {
    if (!sb) throw new Error('Account service is unavailable.');
    const { username, password } = accountCredentials();
    const { data, error } = await sb.auth.signInWithPassword({ email: accountEmail(username), password });
    if (error || !data?.user || !data?.session) throw error || new Error('Incorrect username or password.');
    enterAccount(data.user, username);
  } catch (error) { $('signupError').textContent = signupErrorMessage(error); }
  finally { setAuthBusy(false); }
}
async function initializeAccount() {
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  if (data?.session?.user) {
    try { enterAccount(data.session.user); }
    catch { await sb.auth.signOut(); }
  }
}
async function signOut() {
  await leaveRoom();
  if (sb) await sb.auth.signOut();
  state.account = null;
  $('playerName').value = '';
  $('signupUsername').value = '';
  $('signupPassword').value = '';
  show('auth');
}
function formatLastPlayed(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
function leaderboardHtml(rows) {
  if (!rows.length) return '<p class="status">No rated players yet.</p>';
  return `<table class="ranking"><thead><tr><th>Rank</th><th>Player</th><th>Elo</th><th>Games</th><th>Last played</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${safeInt(row.rank, 1)}</td><td>${escapeHtml(row.username)}</td><td>${safeInt(row.elo)}</td><td>${safeInt(row.games_played)}</td><td>${escapeHtml(formatLastPlayed(row.last_played_at))}</td></tr>`).join('')}</tbody></table>`;
}
async function loadLeaderboard(page = state.leaderboardPage) {
  if (!sb) return;
  state.leaderboardPage = Math.max(1, safeInt(page, 1));
  $('leaderboardStatus').textContent = 'Loading rankings…';
  $('leaderboardRows').innerHTML = '';
  try {
    const seasonId = $('leaderboardSeason').value;
    const rpc = seasonId ? 'get_elo_season_leaderboard' : 'get_elo_leaderboard';
    const params = seasonId ? { p_season_id: seasonId, p_page: state.leaderboardPage, p_page_size: 25 } : { p_page: state.leaderboardPage, p_page_size: 25 };
    const { data, error } = await sb.rpc(rpc, params);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    state.leaderboardTotal = safeInt(rows[0]?.total_players);
    const maxPage = Math.max(1, Math.ceil(state.leaderboardTotal / 25));
    $('leaderboardStatus').textContent = state.leaderboardTotal ? `Page ${state.leaderboardPage} of ${maxPage}` : 'No rated players yet.';
    $('leaderboardRows').innerHTML = leaderboardHtml(rows);
    $('leaderboardPreviousBtn').disabled = state.leaderboardPage <= 1;
    $('leaderboardNextBtn').disabled = state.leaderboardPage >= maxPage;
  } catch (error) {
    $('leaderboardStatus').textContent = 'Leaderboard is unavailable right now.';
    $('leaderboardRows').innerHTML = '';
    $('leaderboardPreviousBtn').disabled = true;
    $('leaderboardNextBtn').disabled = true;
  }
}
async function showLeaderboard() {
  if (!state.account) return void show('auth');
  show('leaderboard');
  try {
    const { data } = await sb.rpc('get_elo_seasons');
    const select = $('leaderboardSeason');
    select.innerHTML = '<option value="">Current season</option>' + (Array.isArray(data) ? data.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(new Date(s.starts_at).toLocaleDateString())}</option>`).join('') : '');
  } catch { /* current leaderboard remains available */ }
  await loadLeaderboard(1);
}
function canonicalPublicKey(key) {
  return JSON.stringify({ crv: key?.crv || '', kty: key?.kty || '', x: key?.x || '', y: key?.y || '' });
}
async function publicKeyHash(key) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPublicKey(key))));
}
async function roomCodeFromPublicKey(key) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = await publicKeyHash(key);
  let value = 0, bits = 0, output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5 && output.length < ROOM_CODE_LENGTH) {
      bits -= 5; output += alphabet[(value >>> bits) & 31];
    }
    if (output.length === ROOM_CODE_LENGTH) break;
  }
  return output;
}
async function hostIdFromPublicKey(key) {
  const bytes = await publicKeyHash(key);
  return Array.from(bytes.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function samePublicKey(left, right) { return canonicalPublicKey(left) === canonicalPublicKey(right); }
function shuffled(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}
function makeQuiz() {
  return shuffled(COUNTRIES).slice(0, TOTAL_FLAGS).map((country) => ({
    name: country.name, code: country.code, flag: country.flag,
    options: shuffled([country.name, ...shuffled(COUNTRIES.filter((item) => item.code !== country.code)).slice(0, 3).map((item) => item.name)])
  }));
}
function validQuiz(quiz) {
  return Array.isArray(quiz) && quiz.length === TOTAL_FLAGS && quiz.every((question) => {
    const country = COUNTRY_BY_CODE.get(String(question?.code || ''));
    return country && question.name === country.name && question.flag === country.flag
      && Array.isArray(question.options) && question.options.length === 4
      && question.options.includes(country.name)
      && question.options.every((option) => typeof option === 'string' && option.length <= 60);
  });
}

async function createIdentity() {
  state.keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  state.publicKey = await crypto.subtle.exportKey('jwk', state.keyPair.publicKey);
}
function bytesToBase64(buffer) {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function signedBytes(envelope) {
  return new TextEncoder().encode(JSON.stringify([envelope.event, envelope.senderId, envelope.seq, envelope.payload]));
}
async function makeEnvelope(event, payload) {
  await cryptoReady;
  const envelope = { event, senderId: state.clientId, seq: ++state.sendSeq, payload };
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, state.keyPair.privateKey, signedBytes(envelope));
  return { ...envelope, signature: bytesToBase64(signature) };
}
async function verifyEnvelope(envelope, publicKey) {
  try {
    if (!envelope || typeof envelope.event !== 'string' || typeof envelope.senderId !== 'string'
      || !Number.isInteger(envelope.seq) || envelope.seq <= safeInt(state.lastSeq[envelope.senderId])) return false;
    const key = await crypto.subtle.importKey('jwk', publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, base64ToBytes(envelope.signature), signedBytes(envelope));
    if (valid) state.lastSeq[envelope.senderId] = envelope.seq;
    return valid;
  } catch { return false; }
}
async function sendSecure(event, payload) {
  if (!state.channel) return;
  const envelope = await makeEnvelope(event, payload);
  return state.channel.send({ type: 'broadcast', event: 'secure', payload: envelope });
}

function rawPresence() {
  if (!state.channel) return [];
  return Object.values(state.channel.presenceState()).flat().filter(Boolean);
}
function onlinePlayers() {
  const players = new Map();
  for (const presence of rawPresence()) {
    const authorized = state.authorized[presence.clientId];
    if (!authorized || !samePublicKey(presence.publicKey, authorized.publicKey)) continue;
    players.set(presence.clientId, {
      clientId: presence.clientId, name: authorized.name,
      isHost: presence.clientId === state.hostId,
      status: presence.status === 'playing' ? 'playing' : 'lobby'
    });
  }
  return [...players.values()];
}
function rankingPlayers() {
  return Object.values(state.scoreboard).map((entry) => {
    const authorized = state.authorized[entry.clientId];
    return {
      clientId: entry.clientId,
      profileId: authorized?.profileId || '',
      name: authorized?.name || 'Player',
      isHost: entry.clientId === state.hostId,
      score: safeInt(entry.score, 0, TOTAL_FLAGS),
      answered: safeInt(entry.answered, 0, TOTAL_FLAGS),
      elapsed: safeInt(entry.elapsed, 0, 86400),
      finished: entry.finished === true
    };
  }).sort((first, second) => second.score - first.score || second.answered - first.answered || first.elapsed - second.elapsed || first.name.localeCompare(second.name));
}
function rankingHtml() {
  const players = rankingPlayers();
  if (!players.length) return '<p class="status">Waiting for the game to start…</p>';
  return `<table class="ranking"><thead><tr><th>#</th><th>Player</th><th>Score</th><th>Progress</th><th>Time</th></tr></thead><tbody>${players.map((player, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(player.name)}${player.isHost ? ' ★' : ''}</td><td>${player.score}/${TOTAL_FLAGS}</td><td>${player.answered}/${TOTAL_FLAGS}</td><td>${formatTime(player.elapsed)}${player.finished ? ' ✓' : ''}</td></tr>`).join('')}</tbody></table>`;
}
function renderPlayers() {
  const players = onlinePlayers().sort((first, second) => Number(second.isHost) - Number(first.isHost) || first.name.localeCompare(second.name));
  $('playersList').innerHTML = players.map((player) => `<div class="player"><span>${escapeHtml(player.name)}${player.isHost ? ' (Host)' : ''}</span><span>${player.status === 'playing' ? 'Playing' : 'Ready'}</span></div>`).join('');
  $('liveRanking').innerHTML = rankingHtml();
  $('finalRanking').innerHTML = rankingHtml();
  if (state.isHost) {
    $('startGameBtn').disabled = players.length < 2 || state.roomStatus !== 'lobby';
    $('lobbyStatus').textContent = players.length < 2 ? 'Waiting for at least one more player…' : `${players.length} players ready`;
  }
}
async function trackPlayer(status = state.roomStatus) {
  if (!state.channel) return;
  await state.channel.track({ clientId: state.clientId, profileId: state.account?.id || '', publicKey: state.publicKey, isHost: state.isHost, status });
}
function rosterPayload() {
  return Object.entries(state.authorized).map(([clientId, player]) => ({ clientId, name: player.name, profileId: player.profileId, publicKey: player.publicKey }));
}
async function sendRoster() { if (state.isHost) await sendSecure('roster', { players: rosterPayload() }); }

async function handleSecure(envelope) {
  if (!envelope || typeof envelope !== 'object') return;
  if (envelope.event === 'join_request') {
    if (!state.isHost || !envelope.payload?.publicKey || !(await verifyEnvelope(envelope, envelope.payload.publicKey))) return;
    return handleJoinRequest(envelope);
  }
  const authorized = state.authorized[envelope.senderId];
  const publicKey = authorized?.publicKey || (envelope.senderId === state.hostId ? state.hostPublicKey : null);
  if (!publicKey || !(await verifyEnvelope(envelope, publicKey))) return;
  if (['join_response', 'roster', 'game_start', 'scoreboard', 'lobby_reset'].includes(envelope.event) && envelope.senderId !== state.hostId) return;
  if (envelope.event === 'join_response') handleJoinResponse(envelope.payload);
  else if (envelope.event === 'roster') handleRoster(envelope.payload);
  else if (envelope.event === 'game_start') startQuiz(envelope.payload);
  else if (envelope.event === 'answer' && state.isHost) handleAnswer(envelope.senderId, envelope.payload);
  else if (envelope.event === 'scoreboard') handleScoreboard(envelope.payload);
  else if (envelope.event === 'lobby_reset') returnToLobby(false);
}
async function handleJoinRequest(envelope) {
  const payload = envelope.payload;
  const name = String(payload.name || '').trim().replace(/\s+/g, ' ').slice(0, 20);
  const names = Object.values(state.authorized).map((player) => player.name.toLowerCase());
  let reason = '';
  if (!name) reason = 'Invalid player name.';
  else if (state.roomStatus !== 'lobby') reason = 'This game is already in progress.';
  else if (names.includes(name.toLowerCase())) reason = 'That player name is already in this room.';
  else if (state.authorized[envelope.senderId]) reason = 'This player is already in the room.';
  if (!reason) state.authorized[envelope.senderId] = { name, profileId: String(payload.profileId || ''), publicKey: payload.publicKey };
  await sendSecure('join_response', { requestId: payload.requestId, targetId: envelope.senderId, accepted: !reason, reason });
  if (!reason) await sendRoster();
}
function handleJoinResponse(payload) {
  if (!state.pendingJoin || payload?.requestId !== state.pendingJoin.requestId || payload?.targetId !== state.clientId) return;
  state.pendingJoin.resolve({ accepted: payload.accepted === true, reason: String(payload.reason || '') });
}
function handleRoster(payload) {
  if (!Array.isArray(payload?.players)) return;
  const next = {};
  for (const player of payload.players.slice(0, 32)) {
    const clientId = String(player?.clientId || '');
    const name = String(player?.name || '').trim().replace(/\s+/g, ' ').slice(0, 20);
    if (clientId && name && player?.publicKey) next[clientId] = { name, publicKey: player.publicKey };
  }
  if (next[state.hostId]) state.authorized = next;
  renderPlayers();
}
function normalizedScoreboard(entries) {
  const next = {};
  if (!Array.isArray(entries)) return next;
  for (const raw of entries.slice(0, 32)) {
    const clientId = String(raw?.clientId || '');
    if (!state.authorized[clientId]) continue;
    next[clientId] = {
      clientId,
      score: safeInt(raw.score, 0, TOTAL_FLAGS),
      answered: safeInt(raw.answered, 0, TOTAL_FLAGS),
      elapsed: safeInt(raw.elapsed, 0, 86400),
      finished: raw.finished === true
    };
  }
  return next;
}
function handleScoreboard(payload) {
  state.scoreboard = normalizedScoreboard(payload?.entries);
  renderPlayers();
}
async function finalizeRating() {
  if (!state.isHost || state.ratingFinalized || !state.matchId || !window.FlagQuizRatingSubmission) return;
  const submission = window.FlagQuizRatingSubmission.create({ matchId: state.matchId, roomCode: state.roomCode, players: rankingPlayers() });
  if (!submission) return;
  state.ratingFinalized = true;
  $('ratingStatus').textContent = 'Applying Elo…';
  const { data, error } = await sb.rpc('finalize_casual_elo_match', submission);
  if (error) { state.ratingFinalized = false; $('ratingStatus').textContent = 'Elo could not be applied.'; return; }
  const mine = (data || []).find((row) => row.profile_id === state.account?.id);
  $('ratingStatus').textContent = mine ? `Elo: ${mine.elo_before} → ${mine.elo_after} (${mine.elo_change >= 0 ? '+' : ''}${mine.elo_change})` : 'Elo updated.';
}
async function handleAnswer(senderId, payload) {
  const entry = state.scoreboard[senderId];
  const questionIndex = safeInt(payload?.questionIndex, -1, TOTAL_FLAGS);
  if (state.roomStatus !== 'playing' || !entry || entry.finished || questionIndex !== entry.answered || !state.quiz[questionIndex]) return;
  const choice = String(payload?.choice || '').slice(0, 60);
  if (!state.quiz[questionIndex].options.includes(choice)) return;
  entry.answered += 1;
  if (choice === state.quiz[questionIndex].name) entry.score += 1;
  entry.elapsed = Math.max(entry.elapsed, safeInt(payload?.elapsed, 0, 86400));
  entry.finished = entry.answered === TOTAL_FLAGS;
  renderPlayers();
  await sendSecure('scoreboard', { entries: Object.values(state.scoreboard) });
  if (Object.values(state.scoreboard).every((item) => item.finished)) await finalizeRating();
}

function configureChannel(channel) {
  channel.on('presence', { event: 'sync' }, renderPlayers);
  channel.on('broadcast', { event: 'secure' }, ({ payload }) => { handleSecure(payload); });
}
async function subscribe(channel) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Could not connect to the room.')), 8000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timeout); reject(new Error('Could not connect to the room.')); }
    });
  });
}
async function findHost() {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const hosts = new Map();
    for (const presence of rawPresence()) {
      if (presence?.isHost !== true || !presence?.clientId || !presence?.publicKey) continue;
      const [code, hostId] = await Promise.all([
        roomCodeFromPublicKey(presence.publicKey),
        hostIdFromPublicKey(presence.publicKey)
      ]);
      if (code === state.roomCode && hostId === presence.clientId) hosts.set(hostId, presence);
    }
    if (hosts.size === 1) return [...hosts.values()][0];
    if (hosts.size > 1) throw new Error('This room has an invalid host state.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Room not found. Check the code and try again.');
}
async function requestToJoin(channel, name) {
  const host = await findHost();
  state.hostId = host.clientId;
  state.hostPublicKey = host.publicKey;
  state.authorized = { [host.clientId]: { name: 'Host', publicKey: host.publicKey } };
  const requestId = crypto.randomUUID();
  const response = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The host did not respond.')), 5000);
    state.pendingJoin = { requestId, resolve: (value) => { clearTimeout(timeout); resolve(value); } };
  });
  await sendSecure('join_request', { requestId, name, profileId: state.account?.id || '', publicKey: state.publicKey });
  const result = await response;
  state.pendingJoin = null;
  if (!result.accepted) throw new Error(result.reason || 'The host rejected this request.');
  state.authorized[state.clientId] = { name, profileId: state.account?.id || '', publicKey: state.publicKey };
  await trackPlayer('lobby');
}
async function connectRoom(code, name, isHost) {
  if (!sb) throw new Error('Multiplayer service is unavailable.');
  await cryptoReady;
  if (state.channel) await sb.removeChannel(state.channel);
  Object.assign(state, { roomCode: code, playerName: name, isHost, roomStatus: 'lobby', scoreboard: {}, lastSeq: {}, sendSeq: 0 });
  if (isHost) {
    state.hostId = state.clientId;
    state.hostPublicKey = state.publicKey;
    state.authorized = { [state.clientId]: { name, profileId: state.account?.id || '', publicKey: state.publicKey } };
  } else {
    state.hostId = '';
    state.hostPublicKey = null;
    state.authorized = {};
  }
  state.channel = sb.channel(`flag-room:${code}`, { config: { presence: { key: state.clientId }, broadcast: { self: true } } });
  configureChannel(state.channel);
  try {
    await subscribe(state.channel);
    if (isHost) await trackPlayer('lobby');
    else await requestToJoin(state.channel, name);
  } catch (error) {
    await sb.removeChannel(state.channel); state.channel = null; throw error;
  }
  $('roomCodeDisplay').textContent = code;
  $('startGameBtn').classList.toggle('hidden', !isHost);
  show('lobby'); renderPlayers();
}
async function createRoom() {
  if (!state.account) return void show('auth');
  const name = cleanName();
  if (!name) return void ($('homeError').textContent = 'Enter your player name first.');
  $('homeError').textContent = ''; $('createRoomBtn').disabled = true;
  try {
    await cryptoReady;
    state.clientId = await hostIdFromPublicKey(state.publicKey);
    const code = await roomCodeFromPublicKey(state.publicKey);
    await connectRoom(code, name, true);
  }
  catch (error) { $('homeError').textContent = error.message; }
  finally { $('createRoomBtn').disabled = false; }
}
async function joinRoom() {
  if (!state.account) return void show('auth');
  const name = cleanName(); const code = cleanCode();
  if (!name) return void ($('homeError').textContent = 'Enter your player name first.');
  if (code.length !== ROOM_CODE_LENGTH) return void ($('homeError').textContent = `Enter a valid ${ROOM_CODE_LENGTH}-character room code.`);
  $('homeError').textContent = ''; $('joinRoomBtn').disabled = true;
  try { await connectRoom(code, name, false); }
  catch (error) { $('homeError').textContent = error.message; }
  finally { $('joinRoomBtn').disabled = false; }
}
async function hostStartGame() {
  const players = onlinePlayers();
  if (!state.isHost || players.length < 2 || state.roomStatus !== 'lobby') return;
  state.roomStatus = 'starting'; renderPlayers();
  const quiz = makeQuiz();
  const scoreboard = Object.fromEntries(players.map((player) => [player.clientId, { clientId: player.clientId, score: 0, answered: 0, elapsed: 0, finished: false }]));
  state.matchId = crypto.randomUUID(); state.ratingFinalized = false;
  await sendSecure('game_start', { quiz, matchId: state.matchId, startedAt: Date.now() + 700, entries: Object.values(scoreboard) });
}
function startQuiz(payload) {
  if (!validQuiz(payload?.quiz) || !Array.isArray(payload?.entries)) return;
  state.quiz = payload.quiz;
  state.scoreboard = normalizedScoreboard(payload.entries);
  state.matchId = String(payload.matchId || ''); state.ratingFinalized = false;
  state.index = 0; state.startedAt = safeInt(payload.startedAt, Date.now() - 5000, Date.now() + 10000);
  state.finished = false; state.answerLocked = false; state.roomStatus = 'playing';
  trackPlayer('playing'); show('quiz'); renderQuestion(); renderPlayers();
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    $('timerDisplay').textContent = formatTime(Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000)));
  }, 1000);
}
function renderQuestion() {
  if (state.index >= state.quiz.length) return void finishGame();
  const question = state.quiz[state.index];
  $('quizProgress').textContent = `${state.index + 1} / ${TOTAL_FLAGS}`;
  $('flagImage').src = question.flag;
  $('options').innerHTML = question.options.map((option) => `<button class="option" type="button">${escapeHtml(option)}</button>`).join('');
  [...$('options').children].forEach((button) => button.addEventListener('click', () => answer(button.textContent)));
  state.answerLocked = false;
}
function answer(choice) {
  if (state.answerLocked || state.finished || !state.quiz[state.index]) return;
  state.answerLocked = true;
  const question = state.quiz[state.index];
  const correct = choice === question.name;
  [...$('options').children].forEach((button) => {
    button.disabled = true;
    if (button.textContent === question.name) button.style.borderColor = '#19a96e';
    else if (button.textContent === choice) button.style.borderColor = '#ef4444';
  });
  sendSecure('answer', {
    questionIndex: state.index,
    choice,
    elapsed: Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000))
  });
  setTimeout(() => { state.index += 1; renderQuestion(); }, correct ? 300 : 650);
}
function finishGame() {
  state.finished = true; clearInterval(state.timer); show('results'); renderPlayers();
  $('rematchBtn').textContent = state.isHost ? 'Return Everyone to Lobby' : 'Back to Lobby';
}
function returnToLobby(broadcast = true) {
  clearInterval(state.timer);
  if (broadcast && state.isHost) sendSecure('lobby_reset', {});
  state.roomStatus = 'lobby'; state.quiz = []; state.scoreboard = {}; state.index = 0; state.startedAt = 0; state.finished = false;
  trackPlayer('lobby'); show('lobby'); renderPlayers();
}
async function leaveRoom() {
  clearInterval(state.timer);
  if (state.channel && sb) await sb.removeChannel(state.channel);
  state.channel = null; state.authorized = {}; state.scoreboard = {}; show('home');
}

$('signupBtn').addEventListener('click', signUp);
$('signinBtn').addEventListener('click', signIn);
$('signoutBtn').addEventListener('click', signOut);
$('signupPassword').addEventListener('keydown', (event) => { if (event.key === 'Enter') signIn(); });
$('createRoomBtn').addEventListener('click', createRoom);
$('leaderboardBtn').addEventListener('click', showLeaderboard);
$('leaderboardBackBtn').addEventListener('click', () => show('home'));
$('leaderboardPreviousBtn').addEventListener('click', () => loadLeaderboard(state.leaderboardPage - 1));
$('leaderboardNextBtn').addEventListener('click', () => loadLeaderboard(state.leaderboardPage + 1));
$('leaderboardSeason').addEventListener('change', () => loadLeaderboard(1));
$('joinRoomBtn').addEventListener('click', joinRoom);
$('roomCodeInput').addEventListener('input', (event) => { event.target.value = cleanCode(); });
$('startGameBtn').addEventListener('click', hostStartGame);
$('leaveRoomBtn').addEventListener('click', leaveRoom);
$('resultsLeaveBtn').addEventListener('click', leaveRoom);
$('rematchBtn').addEventListener('click', () => returnToLobby(true));
initializeAccount();
