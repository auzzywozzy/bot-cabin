// ─────────────────────────────────────────────────────────────────────────────
// Office team roster: the ONE place to add a new agent (bot hire).
// Pure data (no imports) so the frontend, the API (api/status.js) and
// scripts/set-status.sh all read the same list.
//
// To hire a new bot:
//   1. Add an entry to AGENTS below:
//        { id: 'nova', name: 'Nova', color: '#5b8c6a', desk: 'front-1', look: 'nova',
//          status: 'status/nova.json', role: 'Ops' }
//      - id:     lowercase a-z, used in URLs, the status API and scripts/set-status.sh
//      - desk:   a key of DESK_SLOTS (front-1 / front-2 / front-3 are free window desks)
//      - look:   a key of LOOKS in src/avatar.js (copy assistant/analyst and tweak), or an inline
//                look object; unknown looks fall back to a neutral default
//      - status: the local status file (public/<status>) read by the app when there is no API
//   2. ./scripts/set-status.sh nova working "First day!"   (also pushes to your deployed site if SITE_URL and STATUS_WRITE_TOKEN are set)
// Their desk gets their nameplate automatically; meeting / lounge / kitchen spots are
// assigned from the shared pools below by roster order.
// ─────────────────────────────────────────────────────────────────────────────

export const AGENTS = [
  { id: 'assistant', name: 'Assistant', role: 'Admin', color: '#d0643c', desk: 'glass-west', look: 'assistant', status: 'status/assistant.json' },
  { id: 'analyst', name: 'Analyst', role: 'Research', color: '#2f4f8f', desk: 'glass-east', look: 'analyst', status: 'status/analyst.json' },
];

export const STATES = ['working', 'meeting', 'idle', 'break'];

// Desk slots. x/z = desk centre (m), ry = rotation (0 = the person sits on the -z side facing +z).
// decor: 'assistant' | 'analyst' = the hand-dressed desks; anything else = the standard hire setup.
// approach: waypoints (world x,z) from the seat outwards, used when walking to/from the desk.
export const DESK_SLOTS = {
  'glass-west': { x: -3.0, z: -4.35, ry: 0, decor: 'assistant', seat: [-3.0, -5.2], yaw: 0, approach: [[-1.75, -5.25], [-1.55, -3.2]] },
  'glass-east': { x: 3.2, z: -4.35, ry: 0, decor: 'analyst', seat: [3.2, -5.2], yaw: 0, approach: [[1.95, -5.25], [1.75, -3.2]] },
  // spare window desks along the front wall (face the front windows; walkway to the door stays clear)
  'front-1': { x: -4.85, z: 5.72, ry: 0, decor: 'standard', seat: [-4.85, 4.9], yaw: 0, approach: [[-4.85, 3.9]] },
  'front-2': { x: -3.15, z: 5.72, ry: 0, decor: 'standard', seat: [-3.15, 4.9], yaw: 0, approach: [[-3.15, 3.9]] },
  'front-3': { x: 3.1, z: 5.72, ry: 0, decor: 'standard', seat: [3.1, 4.9], yaw: 0, approach: [[3.1, 3.9]] },
};

// Shared spot pools (assigned by roster index). [x, z, yaw, sit, approach[[x,z]...]]
export const SPOT_POOLS = {
  meeting: [
    [-1.3, 0.4, Math.PI / 2, true, [[-2.2, 0.4]]],
    [1.3, 0.4, -Math.PI / 2, true, [[2.2, 0.4]]],
    [0, -0.9, 0, true, [[0, -1.8]]],
    [0, 1.7, Math.PI, true, [[0, 2.6]]],
    [-0.95, 1.35, Math.PI * 0.75, false, [[-1.6, 2.2]]],
  ],
  idle: [
    [5.45, 0.95, Math.PI / 2, true, [[6.2, 0.95], [6.2, -0.75]]],
    [5.45, 2.05, Math.PI / 2, true, [[6.2, 2.05], [6.2, -0.75]]],
    [7.35, -0.25, -Math.PI * 0.75, false, [[6.4, 0.2], [6.2, -0.75]]],
    [6.6, 3.4, Math.PI * 0.8, false, [[6.2, 2.6], [6.2, -0.75]]],
    [4.3, 1.5, Math.PI / 2, false, [[4.0, 0.4]]],
  ],
  break: [
    [-7.65, -4.35, -Math.PI / 2 + 0.55, false, [[-7.65, -2.0], [-5.5, -1.9]]],
    [-7.65, -3.35, -Math.PI / 2 - 0.55, false, [[-7.65, -2.0], [-5.5, -1.9]]],
    [-6.3, -1.9, -Math.PI * 0.6, false, [[-5.5, -1.6]]],
    [-4.9, -2.2, -Math.PI / 2, false, [[-4.4, -1.6]]],
    [-6.9, -1.6, -Math.PI * 0.4, false, [[-5.8, -1.2]]],
  ],
};

export const agentIds = () => AGENTS.map((a) => a.id);
export const deskOwner = (slot) => AGENTS.find((a) => a.desk === slot) || null;
