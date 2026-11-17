/* Tukang Jahit Langit — levels.js
 * Eight evenings of mending the sky. Board coordinates live in a 1280x720 space.
 * Attaches window.SkyLevels.
 */
(function (global) {
  'use strict';

  var levels = [
    {
      id: 1,
      name: { en: 'First Seam', id: 'Jahitan Pertama' },
      thread: 12,
      moves: 5,
      flock: 1,
      start: 0,
      house: 2,
      islands: [
        { x: 200, y: 360, label: '1' },
        { x: 520, y: 360, label: '2' },
        { x: 840, y: 360, label: '3' }
      ],
      links: [[0, 1], [1, 2]],
      storm: [],
      flower: 1
    },
    {
      id: 2,
      name: { en: 'Two Ways Up', id: 'Dua Jalan Naik' },
      thread: 14,
      moves: 6,
      flock: 1,
      start: 0,
      house: 3,
      islands: [
        { x: 180, y: 340, label: '1' },
        { x: 450, y: 220, label: '2' },
        { x: 450, y: 460, label: '3' },
        { x: 760, y: 340, label: '4' }
      ],
      links: [[0, 1], [0, 2], [1, 3], [2, 3]],
      storm: [2],
      flower: 1
    },
    {
      id: 3,
      name: { en: 'Borrowed Thread', id: 'Benang Pinjaman' },
      thread: 4,
      moves: 7,
      flock: 1,
      start: 0,
      house: 3,
      islands: [
        { x: 160, y: 360, label: '1' },
        { x: 400, y: 380, label: '2' },
        { x: 640, y: 340, label: '3' },
        { x: 880, y: 360, label: '4' }
      ],
      links: [[0, 1], [1, 2], [2, 3]],
      storm: [],
      flower: 2
    },
    {
      id: 4,
      name: { en: 'Crackle Ridge', id: 'Punggung Berderak' },
      thread: 13,
      moves: 8,
      flock: 1,
      start: 0,
      house: 4,
      islands: [
        { x: 160, y: 380, label: '1' },
        { x: 400, y: 240, label: '2' },
        { x: 430, y: 520, label: '3' },
        { x: 720, y: 300, label: '4' },
        { x: 980, y: 420, label: '5' }
      ],
      links: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]],
      storm: [2],
      flower: 1
    },
    {
      id: 5,
      name: { en: 'Heavy Wings', id: 'Sayap Berat' },
      thread: 22,
      moves: 7,
      flock: 2,
      start: 0,
      house: 3,
      islands: [
        { x: 200, y: 400, label: '1' },
        { x: 500, y: 300, label: '2' },
        { x: 500, y: 520, label: '3' },
        { x: 860, y: 400, label: '4' }
      ],
      links: [[0, 1], [1, 3], [0, 2], [2, 3]],
      storm: [2],
      flower: 1
    },
    {
      id: 6,
      name: { en: 'Long Mending', id: 'Menambal Panjang' },
      thread: 17,
      moves: 9,
      flock: 2,
      start: 0,
      house: 5,
      islands: [
        { x: 150, y: 360, label: '1' },
        { x: 380, y: 220, label: '2' },
        { x: 380, y: 500, label: '3' },
        { x: 650, y: 360, label: '4' },
        { x: 900, y: 220, label: '5' },
        { x: 900, y: 520, label: '6' }
      ],
      links: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5]],
      storm: [2],
      flower: 3
    },
    {
      id: 7,
      name: { en: 'Rent Corridor', id: 'Koridor Robek' },
      thread: 8,
      moves: 7,
      flock: 2,
      start: 0,
      house: 3,
      islands: [
        { x: 140, y: 360, label: '1' },
        { x: 380, y: 380, label: '2' },
        { x: 620, y: 340, label: '3' },
        { x: 860, y: 360, label: '4' }
      ],
      links: [[0, 1], [1, 2], [2, 3]],
      storm: [],
      flower: 1
    },
    {
      id: 8,
      name: { en: 'The Last Patch', id: 'Tambalan Terakhir' },
      thread: 11,
      moves: 10,
      flock: 3,
      start: 0,
      house: 4,
      islands: [
        { x: 120, y: 600, label: '1' },
        { x: 360, y: 480, label: '2' },
        { x: 720, y: 480, label: '3' },
        { x: 960, y: 600, label: '4' },
        { x: 1200, y: 480, label: '5' },
        { x: 240, y: 300, label: '6' },
        { x: 600, y: 240, label: '7' },
        { x: 1020, y: 280, label: '8' }
      ],
      links: [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 4]],
      storm: [5, 6, 7],
      flower: 2
    }
  ];

  global.SkyLevels = { levels: levels };
})(typeof window !== 'undefined' ? window : this);
