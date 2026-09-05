(() => {
  "use strict";

  /*
   * LABERINTOS — v0.5.0
   *
   * Cambios respecto de v0.4:
   * - 3 variantes visuales de robot
   * - Se evita repetir robot entre niveles cuando es posible
   * - 2 rebotes al recoger objeto
   * - 3 rebotes al llegar a la meta
   * - El popup 👍 aparece después de esos 3 rebotes
   * - Sonidos reajustados para ser más audibles en laptop
   * - Fin de sesión: se muestra el robot actual dormido + 💤
   *
   * Todo lo demás se mantiene.
   */

  const CONFIG = {
    movement: {
      mode: "step",
      stepAnimationMs: 120,
      continuousDelayMs: 170,
    },

    feedback: {
      sound: true,
      vibration: true,
    },

    animation: {
      collectBounceMs: 620,
      goalBounceMs: 900,
    },

    session: {
      durationMs: 7 * 60 * 1000,
      warningMs: 60 * 1000,
      pulseMs: 15 * 1000,
      adultHoldMs: 4000,
      tickMs: 250,
    },

    reset: {
      holdMs: 2000,
    },

    storage: {
      levelKey: "laberintos-v033-last-level",
      sessionStateKey: "laberintos-v040-session-state",
      sessionEndsAtKey: "laberintos-v040-session-ends-at",
    },

    generation: {
      maxAttempts: 90,
      fixedBaseSeed: 481516,
    },
  };

  const SESSION_STATE = {
    READY: "ready",
    PLAYING: "playing",
    REST: "rest",
  };

  const DIRECTIONS = {
    up: {
      dr: -1,
      dc: 0,
      wall: "top",
      opposite: "bottom",
    },

    right: {
      dr: 0,
      dc: 1,
      wall: "right",
      opposite: "left",
    },

    down: {
      dr: 1,
      dc: 0,
      wall: "bottom",
      opposite: "top",
    },

    left: {
      dr: 0,
      dc: -1,
      wall: "left",
      opposite: "right",
    },
  };

  const DIRECTION_LIST = Object.values(DIRECTIONS);

  const NORMAL_GOALS = [
    "🏠",
    "⭐",
    "🚀",
    "🌙",
    "🔭",
    "🪐",
    "💎",
    "🎈",
  ];

  const CHALLENGE_PAIRS = [
    { item: "🔋", goal: "🚀" },
    { item: "🔑", goal: "🏠" },
    { item: "⚙️", goal: "🔧" },
    { item: "⭐", goal: "🔭" },
    { item: "💎", goal: "🪐" },
  ];

  const ROBOT_TYPES = [
    "robot-type-a",
    "robot-type-b",
    "robot-type-c",
  ];

  const mazeEl = document.getElementById("maze");
  const celebrationEl = document.getElementById("celebration");
  const nextButton = document.getElementById("nextButton");
  const soundButton = document.getElementById("soundButton");
  const soundIcon = document.getElementById("soundIcon");
  const levelDots = document.getElementById("levelDots");

  const moveButtons = [
    ...document.querySelectorAll(".move-button"),
  ];

  if (
    !mazeEl ||
    !celebrationEl ||
    !nextButton ||
    !soundButton ||
    !soundIcon ||
    !levelDots
  ) {
    throw new Error(
      "Laberintos: faltan elementos requeridos en index.html."
    );
  }

  let state = {
    levelNumber: loadSavedLevel(),

    levelSpec: null,

    maze: null,

    player: {
      row: 0,
      col: 0,
    },

    start: {
      row: 0,
      col: 0,
    },

    goal: {
      row: 0,
      col: 0,
    },

    challenge: null,
    collectible: null,
    collected: false,

    complete: false,
    moving: false,

    soundEnabled: CONFIG.feedback.sound,

    previousGoalIcon: null,

    currentCellSize: 40,

    sessionState: SESSION_STATE.READY,

    sessionEndsAt: null,

    currentRobotType: null,
    previousRobotType: null,

    collectAnimating: false,
    goalAnimating: false,
  };

  let swipeStart = null;
  let audioContext = null;
  let continuousTimer = null;
  let missionGuideEl = null;

  let sessionTimerEl = null;
  let sessionRingProgressEl = null;
  let restOverlayEl = null;
  let resetLevelButtonEl = null;

  let sessionInterval = null;

  let adultHoldTimer = null;
  let adultHoldStartedAt = null;
  let adultHoldAnimationFrame = null;

  let resetHoldTimer = null;
  let resetHoldStartedAt = null;
  let resetHoldAnimationFrame = null;

  init();

  function init() {
    injectV050Styles();

    createMissionGuide();

    createSessionControls();

    createRestOverlay();

    attachEvents();

    restoreSessionState();

    loadLevel(state.levelNumber);

    updateSessionUI();

    if (
      state.sessionState ===
      SESSION_STATE.PLAYING
    ) {
      startSessionInterval();
    }

    if (
      state.sessionState ===
      SESSION_STATE.REST
    ) {
      showRestOverlay();
    }
  }

  // =========================================================
  // DIFICULTAD
  // =========================================================

  function getLevelSpec(levelNumber) {
    const size = Math.min(
      14,
      8 +
        Math.floor(
          (levelNumber - 1) / 2
        )
    );

    const phase = Math.min(
      1,
      (levelNumber - 1) / 18
    );

    const lateGame = Math.max(
      0,
      levelNumber - 14
    );

    const branchiness = clamp(
      0.075 +
        phase * 0.075 +
        lateGame * 0.0015,
      0.075,
      0.17
    );

    const deadEndDensity = clamp(
      0.105 +
        phase * 0.075 +
        lateGame * 0.001,
      0.105,
      0.19
    );

    const solutionLengthTarget = clamp(
      0.28 +
        phase * 0.17 +
        lateGame * 0.002,
      0.28,
      0.5
    );

    const challengeFrequency =
      levelNumber < 5
        ? 0
        : levelNumber < 14
          ? 3
          : 2;

    const hasChallenge =
      levelNumber >= 5 &&
      (
        levelNumber === 5 ||
        (
          levelNumber < 14
            ? (levelNumber - 5) % 3 === 0
            : levelNumber % challengeFrequency === 0
        )
      );

    const fixed =
      levelNumber <= 3 ||
      levelNumber % 5 === 0;

    return {
      levelNumber,
      rows: size,
      cols: size,
      size,
      fixed,
      seed:
        CONFIG.generation.fixedBaseSeed +
        levelNumber * 7919,
      branchiness,
      deadEndDensity,
      solutionLengthTarget,
      challengeFrequency,
      hasChallenge,
    };
  }

  // =========================================================
  // CARGA DE NIVEL
  // =========================================================

  function loadLevel(levelNumber) {
    const safeLevel = Math.max(
      1,
      Math.floor(levelNumber || 1)
    );

    const spec = getLevelSpec(safeLevel);

    state.levelNumber = safeLevel;
    state.levelSpec = spec;

    state.complete = false;
    state.collected = false;
    state.moving = false;
    state.collectAnimating = false;
    state.goalAnimating = false;

    chooseRobotForLevel();

    const visual = chooseVisualObjective(spec);

    state.challenge = visual.challenge;

    const generated = buildValidatedLevel(spec);

    state.maze = generated.maze;
    state.start = generated.start;
    state.goal = generated.goal;

    state.player = {
      ...generated.start,
    };

    state.collectible = generated.collectible;

    celebrationEl.classList.remove("show");

    celebrationEl.setAttribute(
      "aria-hidden",
      "true"
    );

    updateMissionGuide();

    render();

    saveLevel(state.levelNumber);

    if (
      state.sessionState ===
      SESSION_STATE.REST
    ) {
      showRestOverlay();
    }
  }

  function chooseRobotForLevel() {
    let options = ROBOT_TYPES;

    if (state.previousRobotType) {
      options = ROBOT_TYPES.filter(
        (type) =>
          type !==
          state.previousRobotType
      );
    }

    const selected =
      options[
        Math.floor(
          Math.random() *
            options.length
        )
      ];

    state.currentRobotType = selected;
    state.previousRobotType = selected;
  }

  function chooseVisualObjective(spec) {
    let challenge;

    if (spec.hasChallenge) {
      const rng =
        spec.fixed
          ? seededRandom(spec.seed + 444)
          : Math.random;

      const pairIndex =
        Math.floor(
          rng() *
            CHALLENGE_PAIRS.length
        );

      const pair =
        CHALLENGE_PAIRS[pairIndex];

      challenge = {
        type: "collect",
        itemIcon: pair.item,
        goalIcon: pair.goal,
      };
    } else {
      const rng =
        spec.fixed
          ? seededRandom(spec.seed + 555)
          : Math.random;

      const candidates =
        NORMAL_GOALS.filter(
          (icon) =>
            icon !==
            state.previousGoalIcon
        );

      const goalIcon =
        candidates[
          Math.floor(
            rng() *
              candidates.length
          )
        ] ||
        NORMAL_GOALS[0];

      challenge = {
        type: "normal",
        itemIcon: null,
        goalIcon,
      };
    }

    state.previousGoalIcon =
      challenge.goalIcon;

    return {
      challenge,
    };
  }

  // =========================================================
  // GENERACIÓN Y VALIDACIÓN
  // =========================================================

  function buildValidatedLevel(spec) {
    let bestCandidate = null;
    let bestScore = -Infinity;

    for (
      let attempt = 0;
      attempt <
      CONFIG.generation.maxAttempts;
      attempt++
    ) {
      const rng =
        spec.fixed
          ? seededRandom(
              spec.seed +
                attempt * 104729
            )
          : Math.random;

      const maze =
        generatePrimMaze(
          spec.rows,
          spec.cols,
          rng
        );

      const endpoints =
        chooseStartAndGoal(
          maze,
          rng,
          spec
        );

      if (!endpoints) {
        continue;
      }

      const {
        start,
        goal,
      } = endpoints;

      const mainPath =
        shortestPath(
          maze,
          start,
          goal
        );

      if (!mainPath) {
        continue;
      }

      let collectible = null;

      if (spec.hasChallenge) {
        collectible =
          chooseMeaningfulCollectible(
            maze,
            start,
            goal,
            mainPath,
            rng
          );

        if (!collectible) {
          continue;
        }
      }

      const metrics =
        measureMazeDifficulty(
          maze,
          start,
          goal,
          mainPath
        );

      const assessment =
        assessCandidate(
          metrics,
          spec
        );

      const candidate = {
        maze,
        start,
        goal,
        collectible,
        metrics,
      };

      if (
        assessment.score >
        bestScore
      ) {
        bestScore =
          assessment.score;

        bestCandidate =
          candidate;
      }

      if (
        assessment.accepted &&
        validateLevel({
          maze,
          start,
          goal,
          collectible,
          requiresCollectible:
            spec.hasChallenge,
        })
      ) {
        return candidate;
      }
    }

    if (
      bestCandidate &&
      validateLevel({
        maze:
          bestCandidate.maze,
        start:
          bestCandidate.start,
        goal:
          bestCandidate.goal,
        collectible:
          bestCandidate.collectible,
        requiresCollectible:
          spec.hasChallenge,
      })
    ) {
      return bestCandidate;
    }

    throw new Error(
      `No fue posible generar el nivel ${spec.levelNumber}.`
    );
  }

  // =========================================================
  // RANDOMIZED PRIM
  // =========================================================

  function generatePrimMaze(
    rows,
    cols,
    rng = Math.random
  ) {
    const grid = createGrid(
      rows,
      cols
    );

    const frontier = [];

    const first = {
      row:
        Math.floor(
          rng() * rows
        ),

      col:
        Math.floor(
          rng() * cols
        ),
    };

    grid[first.row][first.col].visited =
      true;

    addFrontierEdges(
      grid,
      first.row,
      first.col,
      frontier
    );

    while (
      frontier.length > 0
    ) {
      const index =
        Math.floor(
          rng() *
            frontier.length
        );

      const edge =
        frontier.splice(
          index,
          1
        )[0];

      const target =
        grid[
          edge.toRow
        ]?.[
          edge.toCol
        ];

      if (
        !target ||
        target.visited
      ) {
        continue;
      }

      const source =
        grid[
          edge.fromRow
        ][
          edge.fromCol
        ];

      removeWallBetween(
        source,
        target,
        edge.directionName
      );

      target.visited = true;

      addFrontierEdges(
        grid,
        target.row,
        target.col,
        frontier
      );
    }

    grid.forEach((row) => {
      row.forEach((cell) => {
        delete cell.visited;
      });
    });

    return grid;
  }

  function createGrid(
    rows,
    cols
  ) {
    return Array.from(
      { length: rows },

      (_, row) =>
        Array.from(
          { length: cols },

          (_, col) => ({
            row,
            col,

            walls: {
              top: true,
              right: true,
              bottom: true,
              left: true,
            },

            visited: false,
          })
        )
    );
  }

  function addFrontierEdges(
    grid,
    row,
    col,
    frontier
  ) {
    for (
      const [
        directionName,
        direction,
      ] of Object.entries(
        DIRECTIONS
      )
    ) {
      const nr =
        row +
        direction.dr;

      const nc =
        col +
        direction.dc;

      const neighbor =
        grid[nr]?.[nc];

      if (
        neighbor &&
        !neighbor.visited
      ) {
        frontier.push({
          fromRow: row,
          fromCol: col,
          toRow: nr,
          toCol: nc,
          directionName,
        });
      }
    }
  }

  function removeWallBetween(
    a,
    b,
    directionName
  ) {
    const direction =
      DIRECTIONS[
        directionName
      ];

    a.walls[
      direction.wall
    ] = false;

    b.walls[
      direction.opposite
    ] = false;
  }

  // =========================================================
  // INICIO Y META
  // =========================================================

  function chooseStartAndGoal(
    maze,
    rng,
    spec
  ) {
    const borderCells =
      getBorderCells(maze);

    if (
      borderCells.length < 2
    ) {
      return null;
    }

    const shuffledStarts =
      shuffleCopy(
        borderCells,
        rng
      ).slice(
        0,
        Math.min(
          12,
          borderCells.length
        )
      );

    const candidates = [];

    for (
      const start of
        shuffledStarts
    ) {
      const distances =
        distanceMap(
          maze,
          start
        );

      for (
        const goal of
          borderCells
      ) {
        if (
          samePosition(
            start,
            goal
          )
        ) {
          continue;
        }

        const distance =
          distances.get(
            cellKey(
              goal.row,
              goal.col
            )
          );

        if (
          distance == null
        ) {
          continue;
        }

        const differentSideBonus =
          borderSide(
            start,
            maze
          ) !==
          borderSide(
            goal,
            maze
          )
            ? 4
            : 0;

        candidates.push({
          start,
          goal,
          distance,
          score:
            distance +
            differentSideBonus,
        });
      }
    }

    candidates.sort(
      (a, b) =>
        b.score -
        a.score
    );

    if (
      candidates.length === 0
    ) {
      return null;
    }

    const topCount =
      Math.max(
        1,
        Math.ceil(
          candidates.length *
            0.08
        )
      );

    const top =
      candidates.slice(
        0,
        topCount
      );

    const selected =
      top[
        Math.floor(
          rng() *
            top.length
        )
      ];

    const minimumAbsoluteDistance =
      Math.max(
        spec.size + 4,
        Math.floor(
          spec.rows *
            spec.cols *
            0.18
        )
      );

    if (
      selected.distance <
      minimumAbsoluteDistance
    ) {
      return null;
    }

    return {
      start: {
        ...selected.start,
      },

      goal: {
        ...selected.goal,
      },
    };
  }

  function getBorderCells(maze) {
    const rows =
      maze.length;

    const cols =
      maze[0].length;

    const result = [];

    for (
      let row = 0;
      row < rows;
      row++
    ) {
      for (
        let col = 0;
        col < cols;
        col++
      ) {
        if (
          row === 0 ||
          col === 0 ||
          row ===
            rows - 1 ||
          col ===
            cols - 1
        ) {
          result.push({
            row,
            col,
          });
        }
      }
    }

    return result;
  }

  function borderSide(
    position,
    maze
  ) {
    const rows =
      maze.length;

    const cols =
      maze[0].length;

    if (
      position.row === 0
    ) {
      return "top";
    }

    if (
      position.col ===
      cols - 1
    ) {
      return "right";
    }

    if (
      position.row ===
      rows - 1
    ) {
      return "bottom";
    }

    if (
      position.col === 0
    ) {
      return "left";
    }

    return "inside";
  }

  // =========================================================
  // OBJETO INTERMEDIO
  // =========================================================

  function chooseMeaningfulCollectible(
    maze,
    start,
    goal,
    mainPath,
    rng
  ) {
    const mainPathKeys =
      new Set(
        mainPath.map(
          (position) =>
            cellKey(
              position.row,
              position.col
            )
        )
      );

    const startDistances =
      distanceMap(
        maze,
        start
      );

    const goalDistances =
      distanceMap(
        maze,
        goal
      );

    const mainDistance =
      mainPath.length - 1;

    const candidates = [];

    for (
      let row = 0;
      row < maze.length;
      row++
    ) {
      for (
        let col = 0;
        col <
        maze[0].length;
        col++
      ) {
        const key =
          cellKey(
            row,
            col
          );

        if (
          mainPathKeys.has(key) ||
          (
            row ===
              start.row &&
            col ===
              start.col
          ) ||
          (
            row ===
              goal.row &&
            col ===
              goal.col
          )
        ) {
          continue;
        }

        const dStart =
          startDistances.get(
            key
          );

        const dGoal =
          goalDistances.get(
            key
          );

        if (
          dStart == null ||
          dGoal == null
        ) {
          continue;
        }

        const detour =
          dStart +
          dGoal -
          mainDistance;

        const distanceToMain =
          nearestDistanceToPath(
            maze,
            { row, col },
            mainPathKeys
          );

        const tooNearStart =
          dStart <
          Math.max(
            4,
            maze.length * 0.45
          );

        const tooNearGoal =
          dGoal <
          Math.max(
            4,
            maze.length * 0.35
          );

        if (
          tooNearStart ||
          tooNearGoal ||
          detour < 4 ||
          distanceToMain < 2
        ) {
          continue;
        }

        candidates.push({
          row,
          col,

          score:
            detour * 2.4 +
            distanceToMain * 3 +
            Math.min(
              dStart,
              dGoal
            ) * 0.25,
        });
      }
    }

    if (
      candidates.length === 0
    ) {
      for (
        let row = 0;
        row < maze.length;
        row++
      ) {
        for (
          let col = 0;
          col <
          maze[0].length;
          col++
        ) {
          const key =
            cellKey(
              row,
              col
            );

          if (
            mainPathKeys.has(key)
          ) {
            continue;
          }

          const dStart =
            startDistances.get(
              key
            );

          const dGoal =
            goalDistances.get(
              key
            );

          if (
            dStart == null ||
            dGoal == null
          ) {
            continue;
          }

          const detour =
            dStart +
            dGoal -
            mainDistance;

          if (
            detour >= 2
          ) {
            candidates.push({
              row,
              col,

              score:
                detour +
                Math.min(
                  dStart,
                  dGoal
                ) * 0.15,
            });
          }
        }
      }
    }

    if (
      candidates.length === 0
    ) {
      return null;
    }

    candidates.sort(
      (a, b) =>
        b.score -
        a.score
    );

    const topCount =
      Math.max(
        1,
        Math.ceil(
          candidates.length *
            0.18
        )
      );

    const top =
      candidates.slice(
        0,
        topCount
      );

    const selected =
      top[
        Math.floor(
          rng() *
            top.length
        )
      ];

    return {
      row:
        selected.row,

      col:
        selected.col,
    };
  }

  function nearestDistanceToPath(
    maze,
    start,
    pathKeys
  ) {
    const queue = [
      {
        ...start,
        distance: 0,
      },
    ];

    const visited =
      new Set([
        cellKey(
          start.row,
          start.col
        ),
      ]);

    while (
      queue.length > 0
    ) {
      const current =
        queue.shift();

      const currentKey =
        cellKey(
          current.row,
          current.col
        );

      if (
        pathKeys.has(
          currentKey
        )
      ) {
        return current.distance;
      }

      const cell =
        maze[
          current.row
        ][
          current.col
        ];

      for (
        const direction of
          DIRECTION_LIST
      ) {
        if (
          cell.walls[
            direction.wall
          ]
        ) {
          continue;
        }

        const nr =
          current.row +
          direction.dr;

        const nc =
          current.col +
          direction.dc;

        const neighbor =
          maze[nr]?.[nc];

        if (
          !neighbor ||
          neighbor.walls[
            direction.opposite
          ]
        ) {
          continue;
        }

        const key =
          cellKey(
            nr,
            nc
          );

        if (
          !visited.has(key)
        ) {
          visited.add(key);

          queue.push({
            row: nr,
            col: nc,
            distance:
              current.distance + 1,
          });
        }
      }
    }

    return 0;
  }

  // =========================================================
  // DIFICULTAD
  // =========================================================

  function measureMazeDifficulty(
    maze,
    start,
    goal,
    mainPath
  ) {
    let junctions = 0;
    let deadEnds = 0;
    let corridors = 0;

    const totalCells =
      maze.length *
      maze[0].length;

    for (
      const row of maze
    ) {
      for (
        const cell of row
      ) {
        const degree =
          openNeighborCount(cell);

        if (
          degree >= 3
        ) {
          junctions++;
        }

        if (
          degree === 1
        ) {
          deadEnds++;
        }

        if (
          degree === 2
        ) {
          corridors++;
        }
      }
    }

    const solutionLength =
      Math.max(
        0,
        mainPath.length - 1
      );

    const solutionRatio =
      solutionLength /
      totalCells;

    const turns =
      countPathTurns(
        mainPath
      );

    const turnRatio =
      solutionLength > 1
        ? turns /
          solutionLength
        : 0;

    return {
      totalCells,
      junctions,
      deadEnds,
      corridors,

      branchiness:
        junctions /
        totalCells,

      deadEndDensity:
        deadEnds /
        totalCells,

      solutionLength,
      solutionRatio,

      turns,
      turnRatio,

      start,
      goal,
    };
  }

  function assessCandidate(
    metrics,
    spec
  ) {
    const branchScore =
      metrics.branchiness /
      spec.branchiness;

    const deadEndScore =
      metrics.deadEndDensity /
      spec.deadEndDensity;

    const solutionScore =
      metrics.solutionRatio /
      spec.solutionLengthTarget;

    const turnTarget =
      spec.levelNumber < 8
        ? 0.22
        : 0.27;

    const turnScore =
      metrics.turnRatio /
      turnTarget;

    const score =
      Math.min(
        branchScore,
        1.3
      ) * 1.2 +

      Math.min(
        deadEndScore,
        1.3
      ) * 1 +

      Math.min(
        solutionScore,
        1.4
      ) * 1.6 +

      Math.min(
        turnScore,
        1.2
      ) * 0.6;

    const accepted =
      metrics.branchiness >=
        spec.branchiness &&

      metrics.deadEndDensity >=
        spec.deadEndDensity &&

      metrics.solutionRatio >=
        spec.solutionLengthTarget &&

      metrics.turnRatio >=
        turnTarget * 0.78;

    return {
      accepted,
      score,
    };
  }

  function openNeighborCount(cell) {
    let count = 0;

    if (!cell.walls.top) {
      count++;
    }

    if (!cell.walls.right) {
      count++;
    }

    if (!cell.walls.bottom) {
      count++;
    }

    if (!cell.walls.left) {
      count++;
    }

    return count;
  }

  function countPathTurns(path) {
    if (
      !path ||
      path.length < 3
    ) {
      return 0;
    }

    let turns = 0;
    let previousDirection = null;

    for (
      let i = 1;
      i < path.length;
      i++
    ) {
      const dr =
        path[i].row -
        path[i - 1].row;

      const dc =
        path[i].col -
        path[i - 1].col;

      const direction =
        `${dr}:${dc}`;

      if (
        previousDirection &&
        direction !==
          previousDirection
      ) {
        turns++;
      }

      previousDirection =
        direction;
    }

    return turns;
  }

  // =========================================================
  // PATHFINDING
  // =========================================================

  function shortestPath(
    maze,
    start,
    goal
  ) {
    const queue = [
      {
        ...start,
      },
    ];

    const visited =
      new Set([
        cellKey(
          start.row,
          start.col
        ),
      ]);

    const parent =
      new Map();

    while (
      queue.length > 0
    ) {
      const current =
        queue.shift();

      const currentKey =
        cellKey(
          current.row,
          current.col
        );

      if (
        samePosition(
          current,
          goal
        )
      ) {
        const path = [];

        let key =
          currentKey;

        while (key) {
          const [
            row,
            col,
          ] =
            key
              .split(":")
              .map(Number);

          path.push({
            row,
            col,
          });

          key =
            parent.get(key) ||
            null;
        }

        return path.reverse();
      }

      const cell =
        maze[
          current.row
        ][
          current.col
        ];

      for (
        const direction of
          DIRECTION_LIST
      ) {
        if (
          cell.walls[
            direction.wall
          ]
        ) {
          continue;
        }

        const nr =
          current.row +
          direction.dr;

        const nc =
          current.col +
          direction.dc;

        const neighbor =
          maze[nr]?.[nc];

        if (
          !neighbor ||
          neighbor.walls[
            direction.opposite
          ]
        ) {
          continue;
        }

        const key =
          cellKey(
            nr,
            nc
          );

        if (
          visited.has(key)
        ) {
          continue;
        }

        visited.add(key);

        parent.set(
          key,
          currentKey
        );

        queue.push({
          row: nr,
          col: nc,
        });
      }
    }

    return null;
  }

  function distanceMap(
    maze,
    start
  ) {
    const distances =
      new Map();

    const queue = [
      {
        row:
          start.row,

        col:
          start.col,

        distance: 0,
      },
    ];

    distances.set(
      cellKey(
        start.row,
        start.col
      ),
      0
    );

    while (
      queue.length > 0
    ) {
      const current =
        queue.shift();

      const cell =
        maze[
          current.row
        ][
          current.col
        ];

      for (
        const direction of
          DIRECTION_LIST
      ) {
        if (
          cell.walls[
            direction.wall
          ]
        ) {
          continue;
        }

        const nr =
          current.row +
          direction.dr;

        const nc =
          current.col +
          direction.dc;

        const neighbor =
          maze[nr]?.[nc];

        if (
          !neighbor ||
          neighbor.walls[
            direction.opposite
          ]
        ) {
          continue;
        }

        const key =
          cellKey(
            nr,
            nc
          );

        if (
          distances.has(key)
        ) {
          continue;
        }

        const nextDistance =
          current.distance + 1;

        distances.set(
          key,
          nextDistance
        );

        queue.push({
          row: nr,
          col: nc,
          distance:
            nextDistance,
        });
      }
    }

    return distances;
  }

  function validateLevel({
    maze,
    start,
    goal,
    collectible,
    requiresCollectible,
  }) {
    if (
      !validateWallConsistency(
        maze
      )
    ) {
      return false;
    }

    if (
      !shortestPath(
        maze,
        start,
        goal
      )
    ) {
      return false;
    }

    if (
      requiresCollectible
    ) {
      if (!collectible) {
        return false;
      }

      if (
        !shortestPath(
          maze,
          start,
          collectible
        )
      ) {
        return false;
      }

      if (
        !shortestPath(
          maze,
          collectible,
          goal
        )
      ) {
        return false;
      }
    }

    return true;
  }

  function validateWallConsistency(
    maze
  ) {
    if (
      !maze?.length ||
      !maze[0]?.length
    ) {
      return false;
    }

    const rows =
      maze.length;

    const cols =
      maze[0].length;

    for (
      let row = 0;
      row < rows;
      row++
    ) {
      for (
        let col = 0;
        col < cols;
        col++
      ) {
        const cell =
          maze[row][col];

        if (
          !cell?.walls
        ) {
          return false;
        }

        if (
          row === 0 &&
          !cell.walls.top
        ) {
          return false;
        }

        if (
          col === 0 &&
          !cell.walls.left
        ) {
          return false;
        }

        if (
          row ===
            rows - 1 &&
          !cell.walls.bottom
        ) {
          return false;
        }

        if (
          col ===
            cols - 1 &&
          !cell.walls.right
        ) {
          return false;
        }

        if (
          col + 1 < cols
        ) {
          if (
            cell.walls.right !==
            maze[row][
              col + 1
            ].walls.left
          ) {
            return false;
          }
        }

        if (
          row + 1 < rows
        ) {
          if (
            cell.walls.bottom !==
            maze[
              row + 1
            ][col].walls.top
          ) {
            return false;
          }
        }
      }
    }

    return true;
  }

  // =========================================================
  // RENDER
  // =========================================================

  function render() {
    const spec =
      state.levelSpec;

    const pagePadding = 24;

    const maxBoardContentWidth =
      520;

    const viewportAvailable =
      Math.max(
        240,
        window.innerWidth -
          pagePadding
      );

    const availableWidth =
      Math.min(
        viewportAvailable,
        maxBoardContentWidth
      );

    const rawCellSize =
      Math.floor(
        availableWidth /
          spec.cols
      );

    const cellSize =
      clamp(
        rawCellSize,
        22,
        62
      );

    state.currentCellSize =
      cellSize;

    const boardWidth =
      spec.cols *
      cellSize;

    const boardHeight =
      spec.rows *
      cellSize;

    mazeEl.style.setProperty(
      "--cell-size",
      `${cellSize}px`
    );

    mazeEl.style.gridTemplateColumns =
      `repeat(${spec.cols}, ${cellSize}px)`;

    mazeEl.style.gridTemplateRows =
      `repeat(${spec.rows}, ${cellSize}px)`;

    mazeEl.style.width =
      `${boardWidth}px`;

    mazeEl.style.height =
      `${boardHeight}px`;

    mazeEl.innerHTML = "";

    for (
      let row = 0;
      row < spec.rows;
      row++
    ) {
      for (
        let col = 0;
        col < spec.cols;
        col++
      ) {
        const cellData =
          state.maze[row][col];

        const cell =
          document.createElement(
            "div"
          );

        cell.className =
          "cell cell-v050";

        cell.dataset.row =
          row;

        cell.dataset.col =
          col;

        if (
          cellData.walls.top
        ) {
          cell.classList.add(
            "wall-top"
          );
        }

        if (
          cellData.walls.right
        ) {
          cell.classList.add(
            "wall-right"
          );
        }

        if (
          cellData.walls.bottom
        ) {
          cell.classList.add(
            "wall-bottom"
          );
        }

        if (
          cellData.walls.left
        ) {
          cell.classList.add(
            "wall-left"
          );
        }

        if (
          row ===
            state.start.row &&
          col ===
            state.start.col
        ) {
          cell.classList.add(
            "start-cell-v050"
          );
        }

        if (
          row ===
            state.goal.row &&
          col ===
            state.goal.col
        ) {
          cell.appendChild(
            createGoalElement()
          );
        }

        if (
          state.collectible &&
          !state.collected &&
          row ===
            state.collectible.row &&
          col ===
            state.collectible.col
        ) {
          cell.appendChild(
            createCollectibleElement()
          );
        }

        if (
          row ===
            state.player.row &&
          col ===
            state.player.col
        ) {
          cell.appendChild(
            createRobot()
          );
        }

        mazeEl.appendChild(
          cell
        );
      }
    }

    mazeEl.appendChild(
      celebrationEl
    );

    mazeEl.appendChild(
      restOverlayEl
    );

    renderProgress();

    updateMissionGuide();

    updateInputLockState();
  }

  function createGoalElement() {
    const goal =
      document.createElement(
        "div"
      );

    const locked =
      state.levelSpec
        .hasChallenge &&
      !state.collected;

    goal.className =
      `goal-v050${
        locked
          ? " goal-locked-v050"
          : ""
      }`;

    goal.setAttribute(
      "aria-hidden",
      "true"
    );

    const icon =
      document.createElement(
        "span"
      );

    icon.className =
      "goal-icon-v050";

    icon.textContent =
      state.challenge
        .goalIcon;

    goal.appendChild(
      icon
    );

    if (locked) {
      const lock =
        document.createElement(
          "span"
        );

      lock.className =
        "goal-lock-v050";

      lock.textContent =
        "🔒";

      goal.appendChild(
        lock
      );
    }

    return goal;
  }

  function createCollectibleElement() {
    const collectible =
      document.createElement(
        "div"
      );

    collectible.className =
      "collectible-v050";

    collectible.textContent =
      state.challenge
        .itemIcon;

    collectible.setAttribute(
      "aria-hidden",
      "true"
    );

    return collectible;
  }

  function createRobot({
    sleeping = false,
  } = {}) {
    const wrapper =
      document.createElement(
        "div"
      );

    wrapper.className =
      "robot-safe-v050";

    if (sleeping) {
      wrapper.classList.add(
        "robot-sleeping-wrapper-v050"
      );
    }

    const robot =
      document.createElement(
        "div"
      );

    robot.className =
      [
        "robot",
        "robot-v050",
        state.currentRobotType,
        state.collected
          ? "has-item"
          : "",
        sleeping
          ? "robot-sleeping-v050"
          : "",
      ]
        .filter(Boolean)
        .join(" ");

    if (!sleeping) {
      robot.id =
        "playerRobot";
    }

    robot.setAttribute(
      "aria-label",
      sleeping
        ? "Robot durmiendo"
        : "Robot"
    );

    const robotScale =
      clamp(
        state.currentCellSize /
          46,
        0.48,
        0.92
      );

    robot.style.transform =
      `scale(${robotScale})`;

    robot.style.transformOrigin =
      "center center";

    robot.innerHTML =
      createRobotMarkup(
        state.currentRobotType,
        sleeping
      );

    wrapper.appendChild(
      robot
    );

    return wrapper;
  }

  function createRobotMarkup(
    type,
    sleeping = false
  ) {
    const eyeClass =
      sleeping
        ? "sleeping-eye-v050"
        : "";

    if (
      type ===
      "robot-type-b"
    ) {
      return `
        <span class="robot-antenna robot-antenna-b-v050">
          <span class="robot-antenna-tip-v050"></span>
        </span>

        <span class="robot-head robot-head-b-v050">
          <span class="robot-eye left-eye ${eyeClass}"></span>
          <span class="robot-eye right-eye ${eyeClass}"></span>
        </span>

        <span class="robot-body robot-body-b-v050">
          <span class="robot-body-light-v050"></span>
        </span>
      `;
    }

    if (
      type ===
      "robot-type-c"
    ) {
      return `
        <span class="robot-antenna robot-antenna-c-v050">
          <span class="robot-antenna-tip-v050"></span>
        </span>

        <span class="robot-head robot-head-c-v050">
          <span class="robot-eye left-eye ${eyeClass}"></span>
          <span class="robot-eye right-eye ${eyeClass}"></span>
        </span>

        <span class="robot-body robot-body-c-v050">
          <span class="robot-body-light-v050"></span>
        </span>
      `;
    }

    return `
      <span class="robot-antenna">
        <span class="robot-antenna-tip-v050"></span>
      </span>

      <span class="robot-head">
        <span class="robot-eye left-eye ${eyeClass}"></span>
        <span class="robot-eye right-eye ${eyeClass}"></span>
      </span>

      <span class="robot-body">
        <span class="robot-body-light-v050"></span>
      </span>
    `;
  }

  function renderProgress() {
    const visibleDots = 10;

    const windowStart =
      Math.floor(
        (
          state.levelNumber -
          1
        ) /
          visibleDots
      ) *
        visibleDots +
      1;

    levelDots.innerHTML = "";

    for (
      let i = 0;
      i < visibleDots;
      i++
    ) {
      const representedLevel =
        windowStart + i;

      const dot =
        document.createElement(
          "span"
        );

      dot.className =
        "level-dot";

      if (
        representedLevel <
        state.levelNumber
      ) {
        dot.classList.add(
          "completed"
        );
      }

      if (
        representedLevel ===
        state.levelNumber
      ) {
        dot.classList.add(
          "current"
        );
      }

      levelDots.appendChild(
        dot
      );
    }
  }

  // =========================================================
  // GUÍA VISUAL
  // =========================================================

  function createMissionGuide() {
    missionGuideEl =
      document.createElement(
        "div"
      );

    missionGuideEl.id =
      "missionGuideV050";

    missionGuideEl.className =
      "mission-guide-v050";

    missionGuideEl.setAttribute(
      "aria-hidden",
      "true"
    );

    mazeEl.insertAdjacentElement(
      "beforebegin",
      missionGuideEl
    );
  }

  function updateMissionGuide() {
    if (
      !missionGuideEl
    ) {
      return;
    }

    if (
      !state.levelSpec
        ?.hasChallenge
    ) {
      missionGuideEl
        .classList
        .remove("show");

      missionGuideEl.innerHTML =
        "";

      return;
    }

    missionGuideEl
      .classList
      .add("show");

    if (
      !state.collected
    ) {
      missionGuideEl.innerHTML = `
        <span class="mission-step-v050 mission-active-v050">
          ${state.challenge.itemIcon}
        </span>

        <span class="mission-arrow-v050">
          ➜
        </span>

        <span class="mission-step-v050 mission-locked-v050">
          ${state.challenge.goalIcon}

          <span class="mission-lock-v050">
            🔒
          </span>
        </span>
      `;
    } else {
      missionGuideEl.innerHTML = `
        <span class="mission-step-v050 mission-done-v050">
          ✓
        </span>

        <span class="mission-arrow-v050">
          ➜
        </span>

        <span class="mission-step-v050 mission-active-v050">
          ${state.challenge.goalIcon}
        </span>
      `;
    }
  }

  function flashMissionGuide() {
    if (
      !missionGuideEl ||
      !state.levelSpec
        .hasChallenge
    ) {
      return;
    }

    missionGuideEl
      .classList
      .remove(
        "mission-nudge-v050"
      );

    void missionGuideEl.offsetWidth;

    missionGuideEl
      .classList
      .add(
        "mission-nudge-v050"
      );
  }

  // =========================================================
  // SESSION TIMER
  // =========================================================

  function createSessionControls() {
    const host =
      soundButton.parentElement ||
      document.body;

    const controls =
      document.createElement(
        "div"
      );

    controls.className =
      "session-controls-v050";

    sessionTimerEl =
      document.createElement(
        "button"
      );

    sessionTimerEl.type =
      "button";

    sessionTimerEl.className =
      "session-timer-v050";

    sessionTimerEl.setAttribute(
      "aria-label",
      "Temporizador de sesión"
    );

    sessionTimerEl.innerHTML = `
      <svg
        class="session-ring-v050"
        viewBox="0 0 44 44"
        aria-hidden="true"
      >
        <circle
          class="session-ring-track-v050"
          cx="22"
          cy="22"
          r="18"
        ></circle>

        <circle
          class="session-ring-progress-v050"
          cx="22"
          cy="22"
          r="18"
        ></circle>
      </svg>

      <span class="session-timer-icon-v050">
        ⏱
      </span>

      <span class="adult-hold-progress-v050"></span>
    `;

    sessionRingProgressEl =
      sessionTimerEl.querySelector(
        ".session-ring-progress-v050"
      );

    resetLevelButtonEl =
      document.createElement(
        "button"
      );

    resetLevelButtonEl.type =
      "button";

    resetLevelButtonEl.className =
      "reset-level-v050";

    resetLevelButtonEl.setAttribute(
      "aria-label",
      "Volver al primer nivel"
    );

    resetLevelButtonEl.innerHTML = `
      <span class="reset-icon-v050">
        ↺
      </span>

      <span class="reset-hold-progress-v050"></span>
    `;

    controls.appendChild(
      resetLevelButtonEl
    );

    controls.appendChild(
      sessionTimerEl
    );

    host.insertBefore(
      controls,
      soundButton
    );

    attachSessionControlEvents();
  }

  function attachSessionControlEvents() {
    sessionTimerEl.addEventListener(
      "pointerdown",
      startAdultSessionHold
    );

    [
      "pointerup",
      "pointercancel",
      "pointerleave",
    ].forEach(
      (eventName) => {
        sessionTimerEl.addEventListener(
          eventName,
          cancelAdultSessionHold
        );
      }
    );

    resetLevelButtonEl.addEventListener(
      "pointerdown",
      startLevelResetHold
    );

    [
      "pointerup",
      "pointercancel",
      "pointerleave",
    ].forEach(
      (eventName) => {
        resetLevelButtonEl.addEventListener(
          eventName,
          cancelLevelResetHold
        );
      }
    );
  }

  function restoreSessionState() {
    try {
      const savedState =
        localStorage.getItem(
          CONFIG.storage.sessionStateKey
        );

      const savedEndsAt =
        Number(
          localStorage.getItem(
            CONFIG.storage.sessionEndsAtKey
          )
        );

      if (
        savedState ===
          SESSION_STATE.PLAYING &&
        Number.isFinite(
          savedEndsAt
        )
      ) {
        if (
          Date.now() >=
          savedEndsAt
        ) {
          state.sessionState =
            SESSION_STATE.REST;

          state.sessionEndsAt =
            null;

          persistSessionState();

          return;
        }

        state.sessionState =
          SESSION_STATE.PLAYING;

        state.sessionEndsAt =
          savedEndsAt;

        return;
      }

      if (
        savedState ===
        SESSION_STATE.REST
      ) {
        state.sessionState =
          SESSION_STATE.REST;

        state.sessionEndsAt =
          null;

        return;
      }

      state.sessionState =
        SESSION_STATE.READY;

      state.sessionEndsAt =
        null;
    } catch (_) {
      state.sessionState =
        SESSION_STATE.READY;

      state.sessionEndsAt =
        null;
    }
  }

  function persistSessionState() {
    try {
      localStorage.setItem(
        CONFIG.storage.sessionStateKey,
        state.sessionState
      );

      if (
        state.sessionEndsAt
      ) {
        localStorage.setItem(
          CONFIG.storage.sessionEndsAtKey,
          String(
            state.sessionEndsAt
          )
        );
      } else {
        localStorage.removeItem(
          CONFIG.storage.sessionEndsAtKey
        );
      }
    } catch (_) {}
  }

  function startSessionIfNeeded() {
    if (
      state.sessionState !==
      SESSION_STATE.READY
    ) {
      return;
    }

    state.sessionState =
      SESSION_STATE.PLAYING;

    state.sessionEndsAt =
      Date.now() +
      CONFIG.session.durationMs;

    persistSessionState();

    startSessionInterval();

    updateSessionUI();
  }

  function startSessionInterval() {
    stopSessionInterval();

    sessionInterval =
      window.setInterval(
        tickSession,
        CONFIG.session.tickMs
      );

    tickSession();
  }

  function stopSessionInterval() {
    if (
      sessionInterval !==
      null
    ) {
      clearInterval(
        sessionInterval
      );

      sessionInterval =
        null;
    }
  }

  function tickSession() {
    if (
      state.sessionState !==
      SESSION_STATE.PLAYING ||
      !state.sessionEndsAt
    ) {
      return;
    }

    const remaining =
      state.sessionEndsAt -
      Date.now();

    if (
      remaining <= 0
    ) {
      expireSession();
      return;
    }

    updateSessionUI(
      remaining
    );
  }

  function expireSession() {
    state.sessionState =
      SESSION_STATE.REST;

    state.sessionEndsAt =
      null;

    stopSessionInterval();

    persistSessionState();

    updateSessionUI();

    updateInputLockState();

    stopContinuousMovement();

    celebrationEl
      .classList
      .remove("show");

    celebrationEl
      .setAttribute(
        "aria-hidden",
        "true"
      );

    showRestOverlay();

    playRestTone();

    vibrate([
      45,
      60,
      45,
    ]);
  }

  function resetSessionByAdult() {
    state.sessionState =
      SESSION_STATE.READY;

    state.sessionEndsAt =
      null;

    stopSessionInterval();

    persistSessionState();

    hideRestOverlay();

    updateSessionUI();

    updateInputLockState();

    playTone("collect");

    vibrate(50);
  }

  function updateSessionUI(
    explicitRemaining = null
  ) {
    if (
      !sessionTimerEl ||
      !sessionRingProgressEl
    ) {
      return;
    }

    let remaining =
      explicitRemaining;

    if (
      state.sessionState ===
      SESSION_STATE.READY
    ) {
      remaining =
        CONFIG.session.durationMs;
    }

    if (
      state.sessionState ===
      SESSION_STATE.REST
    ) {
      remaining = 0;
    }

    if (
      state.sessionState ===
        SESSION_STATE.PLAYING &&
      remaining == null
    ) {
      remaining =
        Math.max(
          0,
          state.sessionEndsAt -
            Date.now()
        );
    }

    const ratio =
      clamp(
        remaining /
          CONFIG.session.durationMs,
        0,
        1
      );

    const circumference =
      2 *
      Math.PI *
      18;

    const dashOffset =
      circumference *
      (1 - ratio);

    sessionRingProgressEl.style.strokeDasharray =
      `${circumference}`;

    sessionRingProgressEl.style.strokeDashoffset =
      `${dashOffset}`;

    sessionTimerEl.classList.remove(
      "warning",
      "pulse",
      "rest"
    );

    if (
      state.sessionState ===
      SESSION_STATE.REST
    ) {
      sessionTimerEl.classList.add(
        "rest"
      );

      return;
    }

    if (
      remaining <=
      CONFIG.session.warningMs
    ) {
      sessionTimerEl.classList.add(
        "warning"
      );
    }

    if (
      remaining <=
        CONFIG.session.pulseMs &&
      state.sessionState ===
        SESSION_STATE.PLAYING
    ) {
      sessionTimerEl.classList.add(
        "pulse"
      );
    }
  }

  // =========================================================
  // ADULT HOLD — TIMER
  // =========================================================

  function startAdultSessionHold(
    event
  ) {
    event.preventDefault();

    cancelAdultSessionHold();

    adultHoldStartedAt =
      performance.now();

    sessionTimerEl.classList.add(
      "holding"
    );

    updateAdultHoldProgress();

    adultHoldTimer =
      window.setTimeout(
        () => {
          finishAdultSessionHold();
        },
        CONFIG.session.adultHoldMs
      );
  }

  function updateAdultHoldProgress() {
    if (
      adultHoldStartedAt ==
      null
    ) {
      return;
    }

    const elapsed =
      performance.now() -
      adultHoldStartedAt;

    const ratio =
      clamp(
        elapsed /
          CONFIG.session.adultHoldMs,
        0,
        1
      );

    sessionTimerEl.style.setProperty(
      "--adult-hold-progress",
      `${ratio * 360}deg`
    );

    if (
      ratio < 1
    ) {
      adultHoldAnimationFrame =
        requestAnimationFrame(
          updateAdultHoldProgress
        );
    }
  }

  function finishAdultSessionHold() {
    cancelAdultSessionHold(
      false
    );

    resetSessionByAdult();
  }

  function cancelAdultSessionHold(
    resetVisual = true
  ) {
    if (
      adultHoldTimer !==
      null
    ) {
      clearTimeout(
        adultHoldTimer
      );

      adultHoldTimer =
        null;
    }

    if (
      adultHoldAnimationFrame !==
      null
    ) {
      cancelAnimationFrame(
        adultHoldAnimationFrame
      );

      adultHoldAnimationFrame =
        null;
    }

    adultHoldStartedAt =
      null;

    if (
      sessionTimerEl
    ) {
      sessionTimerEl.classList.remove(
        "holding"
      );

      if (
        resetVisual
      ) {
        sessionTimerEl.style.setProperty(
          "--adult-hold-progress",
          "0deg"
        );
      }
    }
  }

  // =========================================================
  // LEVEL RESET HOLD
  // =========================================================

  function startLevelResetHold(
    event
  ) {
    event.preventDefault();

    cancelLevelResetHold();

    resetHoldStartedAt =
      performance.now();

    resetLevelButtonEl.classList.add(
      "holding"
    );

    updateLevelResetHoldProgress();

    resetHoldTimer =
      window.setTimeout(
        () => {
          finishLevelResetHold();
        },
        CONFIG.reset.holdMs
      );
  }

  function updateLevelResetHoldProgress() {
    if (
      resetHoldStartedAt ==
      null
    ) {
      return;
    }

    const elapsed =
      performance.now() -
      resetHoldStartedAt;

    const ratio =
      clamp(
        elapsed /
          CONFIG.reset.holdMs,
        0,
        1
      );

    resetLevelButtonEl.style.setProperty(
      "--reset-hold-progress",
      `${ratio * 360}deg`
    );

    if (
      ratio < 1
    ) {
      resetHoldAnimationFrame =
        requestAnimationFrame(
          updateLevelResetHoldProgress
        );
    }
  }

  function finishLevelResetHold() {
    cancelLevelResetHold(
      false
    );

    loadLevel(1);

    playTone("collect");

    vibrate(50);
  }

  function cancelLevelResetHold(
    resetVisual = true
  ) {
    if (
      resetHoldTimer !==
      null
    ) {
      clearTimeout(
        resetHoldTimer
      );

      resetHoldTimer =
        null;
    }

    if (
      resetHoldAnimationFrame !==
      null
    ) {
      cancelAnimationFrame(
        resetHoldAnimationFrame
      );

      resetHoldAnimationFrame =
        null;
    }

    resetHoldStartedAt =
      null;

    if (
      resetLevelButtonEl
    ) {
      resetLevelButtonEl.classList.remove(
        "holding"
      );

      if (
        resetVisual
      ) {
        resetLevelButtonEl.style.setProperty(
          "--reset-hold-progress",
          "0deg"
        );
      }
    }
  }

  // =========================================================
  // REST OVERLAY
  // =========================================================

  function createRestOverlay() {
    restOverlayEl =
      document.createElement(
        "div"
      );

    restOverlayEl.className =
      "rest-overlay-v050";

    restOverlayEl.setAttribute(
      "aria-hidden",
      "true"
    );
  }

  function populateRestOverlay() {
    if (
      !restOverlayEl
    ) {
      return;
    }

    restOverlayEl.innerHTML = "";

    const content =
      document.createElement(
        "div"
      );

    content.className =
      "rest-content-v050";

    const sleepingRobot =
      createRobot({
        sleeping: true,
      });

    sleepingRobot.classList.add(
      "rest-robot-v050"
    );

    const zzz =
      document.createElement(
        "div"
      );

    zzz.className =
      "zzz-v050";

    zzz.innerHTML = `
      <span>z</span>
      <span>z</span>
      <span>Z</span>
    `;

    content.appendChild(
      sleepingRobot
    );

    content.appendChild(
      zzz
    );

    restOverlayEl.appendChild(
      content
    );
  }

  function showRestOverlay() {
    if (
      !restOverlayEl
    ) {
      return;
    }

    populateRestOverlay();

    if (
      restOverlayEl.parentElement !==
      mazeEl
    ) {
      mazeEl.appendChild(
        restOverlayEl
      );
    }

    restOverlayEl.classList.add(
      "show"
    );

    restOverlayEl.setAttribute(
      "aria-hidden",
      "false"
    );
  }

  function hideRestOverlay() {
    if (
      !restOverlayEl
    ) {
      return;
    }

    restOverlayEl.classList.remove(
      "show"
    );

    restOverlayEl.setAttribute(
      "aria-hidden",
      "true"
    );
  }

  // =========================================================
  // INPUT LOCK
  // =========================================================

  function updateInputLockState() {
    const locked =
      state.sessionState ===
      SESSION_STATE.REST;

    moveButtons.forEach(
      (button) => {
        button.disabled =
          locked;

        button.classList.toggle(
          "session-disabled-v050",
          locked
        );
      }
    );
  }

  // =========================================================
  // MOVIMIENTO
  // =========================================================

  function move(
    directionName
  ) {
    if (
      state.complete ||
      state.moving ||
      state.collectAnimating ||
      state.goalAnimating ||
      state.sessionState ===
        SESSION_STATE.REST
    ) {
      return;
    }

    const direction =
      DIRECTIONS[
        directionName
      ];

    if (!direction) {
      return;
    }

    const current =
      state.maze[
        state.player.row
      ][
        state.player.col
      ];

    if (
      current.walls[
        direction.wall
      ]
    ) {
      blockedFeedback();
      return;
    }

    const nextRow =
      state.player.row +
      direction.dr;

    const nextCol =
      state.player.col +
      direction.dc;

    const neighbor =
      state.maze[
        nextRow
      ]?.[
        nextCol
      ];

    if (
      !neighbor ||
      neighbor.walls[
        direction.opposite
      ]
    ) {
      blockedFeedback();
      return;
    }

    startSessionIfNeeded();

    state.moving = true;

    state.player = {
      row: nextRow,
      col: nextCol,
    };

    playTone("step");

    const justCollected =
      Boolean(
        state.collectible &&
        !state.collected &&
        samePosition(
          state.player,
          state.collectible
        )
      );

    if (justCollected) {
      state.collected = true;
    }

    render();

    const robot =
      document.getElementById(
        "playerRobot"
      );

    if (robot) {
      robot.classList.add(
        "step"
      );
    }

    const duration =
      prefersReducedMotion()
        ? 0
        : CONFIG.movement
            .stepAnimationMs;

    window.setTimeout(
      () => {
        state.moving = false;

        if (
          state.sessionState ===
          SESSION_STATE.REST
        ) {
          updateInputLockState();
          return;
        }

        if (justCollected) {
          runCollectAnimation();
          return;
        }

        checkGoal();
      },
      duration
    );
  }

  function runCollectAnimation() {
    state.collectAnimating =
      true;

    playCollectSound();

    vibrate([
      25,
      35,
      25,
    ]);

    const robot =
      document.getElementById(
        "playerRobot"
      );

    if (robot) {
      robot.classList.remove(
        "collect-bounce-v050"
      );

      void robot.offsetWidth;

      robot.classList.add(
        "collect-bounce-v050"
      );
    }

    const duration =
      prefersReducedMotion()
        ? 0
        : CONFIG.animation
            .collectBounceMs;

    window.setTimeout(
      () => {
        state.collectAnimating =
          false;

        checkGoal();
      },
      duration
    );
  }

  function blockedFeedback() {
    if (
      state.sessionState ===
      SESSION_STATE.REST
    ) {
      return;
    }

    const robot =
      document.getElementById(
        "playerRobot"
      );

    if (robot) {
      robot.classList.remove(
        "bump"
      );

      void robot.offsetWidth;

      robot.classList.add(
        "bump"
      );
    }

    playBumpSound();

    vibrate(28);
  }

  function checkGoal() {
    if (
      state.sessionState ===
      SESSION_STATE.REST
    ) {
      return;
    }

    if (
      !samePosition(
        state.player,
        state.goal
      )
    ) {
      return;
    }

    if (
      state.levelSpec
        .hasChallenge &&
      !state.collected
    ) {
      blockedFeedback();

      flashMissionGuide();

      return;
    }

    runGoalAnimation();
  }

  function runGoalAnimation() {
    if (
      state.goalAnimating ||
      state.complete
    ) {
      return;
    }

    state.goalAnimating =
      true;

    state.complete =
      true;

    playSuccessSequence();

    vibrate([
      40,
      35,
      50,
    ]);

    const robot =
      document.getElementById(
        "playerRobot"
      );

    if (robot) {
      robot.classList.remove(
        "goal-bounce-v050"
      );

      void robot.offsetWidth;

      robot.classList.add(
        "goal-bounce-v050"
      );
    }

    const duration =
      prefersReducedMotion()
        ? 0
        : CONFIG.animation
            .goalBounceMs;

    window.setTimeout(
      () => {
        state.goalAnimating =
          false;

        if (
          state.sessionState ===
          SESSION_STATE.REST
        ) {
          return;
        }

        celebrationEl
          .classList
          .add("show");

        celebrationEl
          .setAttribute(
            "aria-hidden",
            "false"
          );
      },
      duration
    );
  }

  function nextLevel() {
    if (
      state.sessionState ===
      SESSION_STATE.REST ||
      state.goalAnimating
    ) {
      return;
    }

    celebrationEl
      .classList
      .remove("show");

    celebrationEl
      .setAttribute(
        "aria-hidden",
        "true"
      );

    loadLevel(
      state.levelNumber + 1
    );
  }

  // =========================================================
  // EVENTOS
  // =========================================================

  function attachEvents() {
    moveButtons.forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            move(
              button.dataset.direction
            );
          }
        );

        button.addEventListener(
          "pointerdown",
          () => {
            if (
              CONFIG.movement.mode ===
              "continuous"
            ) {
              startContinuousMovement(
                button.dataset.direction
              );
            }
          }
        );

        [
          "pointerup",
          "pointercancel",
          "pointerleave",
        ].forEach(
          (eventName) => {
            button.addEventListener(
              eventName,
              stopContinuousMovement
            );
          }
        );
      }
    );

    mazeEl.addEventListener(
      "pointerdown",
      handleSwipeStart
    );

    mazeEl.addEventListener(
      "pointerup",
      handleSwipeEnd
    );

    mazeEl.addEventListener(
      "pointercancel",
      () => {
        swipeStart = null;
      }
    );

    nextButton.addEventListener(
      "click",
      nextLevel
    );

    soundButton.addEventListener(
      "click",
      () => {
        state.soundEnabled =
          !state.soundEnabled;

        soundIcon.textContent =
          state.soundEnabled
            ? "🔊"
            : "🔇";

        if (
          state.soundEnabled
        ) {
          playTone("tap");
        }
      }
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.ctrlKey &&
          event.altKey &&
          event.shiftKey &&
          event.key.toLowerCase() ===
            "t"
        ) {
          event.preventDefault();

          resetSessionByAdult();

          return;
        }

        const map = {
          ArrowUp: "up",
          ArrowRight: "right",
          ArrowDown: "down",
          ArrowLeft: "left",
        };

        const direction =
          map[event.key];

        if (!direction) {
          return;
        }

        if (
          state.sessionState ===
          SESSION_STATE.REST
        ) {
          event.preventDefault();
          return;
        }

        event.preventDefault();

        move(direction);
      }
    );

    window.addEventListener(
      "resize",
      () => {
        render();
      }
    );
  }

  // =========================================================
  // SWIPE
  // =========================================================

  function handleSwipeStart(
    event
  ) {
    if (
      state.complete ||
      state.collectAnimating ||
      state.goalAnimating ||
      state.sessionState ===
        SESSION_STATE.REST
    ) {
      return;
    }

    swipeStart = {
      x: event.clientX,
      y: event.clientY,
      pointerId:
        event.pointerId,
    };

    if (
      mazeEl.setPointerCapture
    ) {
      try {
        mazeEl.setPointerCapture(
          event.pointerId
        );
      } catch (_) {}
    }
  }

  function handleSwipeEnd(
    event
  ) {
    if (
      !swipeStart ||
      state.complete ||
      state.collectAnimating ||
      state.goalAnimating ||
      state.sessionState ===
        SESSION_STATE.REST
    ) {
      return;
    }

    const dx =
      event.clientX -
      swipeStart.x;

    const dy =
      event.clientY -
      swipeStart.y;

    const minDistance = 22;

    swipeStart = null;

    if (
      Math.max(
        Math.abs(dx),
        Math.abs(dy)
      ) <
      minDistance
    ) {
      return;
    }

    if (
      Math.abs(dx) >
      Math.abs(dy)
    ) {
      move(
        dx > 0
          ? "right"
          : "left"
      );
    } else {
      move(
        dy > 0
          ? "down"
          : "up"
      );
    }
  }

  // =========================================================
  // MOVIMIENTO CONTINUO
  // =========================================================

  function startContinuousMovement(
    direction
  ) {
    if (
      state.sessionState ===
      SESSION_STATE.REST
    ) {
      return;
    }

    stopContinuousMovement();

    move(direction);

    continuousTimer =
      window.setInterval(
        () => {
          move(direction);
        },

        CONFIG.movement
          .continuousDelayMs
      );
  }

  function stopContinuousMovement() {
    if (
      continuousTimer !==
      null
    ) {
      clearInterval(
        continuousTimer
      );

      continuousTimer = null;
    }
  }

  // =========================================================
  // SONIDO
  // =========================================================

  function getAudioContext() {
    if (
      !state.soundEnabled
    ) {
      return null;
    }

    if (!audioContext) {
      const AudioCtx =
        window.AudioContext ||
        window.webkitAudioContext;

      if (!AudioCtx) {
        return null;
      }

      audioContext =
        new AudioCtx();
    }

    if (
      audioContext.state ===
      "suspended"
    ) {
      audioContext
        .resume()
        .catch(() => {});
    }

    return audioContext;
  }

  function playTone(type) {
    if (
      !state.soundEnabled
    ) {
      return;
    }

    const ctx =
      getAudioContext();

    if (!ctx) {
      return;
    }

    const presets = {
      tap: {
        frequency: 440,
        duration: 0.05,
        gain: 0.045,
        type: "sine",
      },

      step: {
        frequency: 260,
        duration: 0.035,
        gain: 0.026,
        type: "sine",
      },

      collect: {
        frequency: 560,
        duration: 0.08,
        gain: 0.05,
        type: "sine",
      },
    };

    const preset =
      presets[type] ||
      presets.tap;

    playSingleTone(
      ctx,
      preset.frequency,
      preset.duration,
      preset.gain,
      0,
      preset.type
    );
  }

  function playBumpSound() {
    if (
      !state.soundEnabled
    ) {
      return;
    }

    const ctx =
      getAudioContext();

    if (!ctx) {
      return;
    }

    /*
     * Antes era 115 Hz / 0.02:
     * demasiado grave y débil para
     * muchos parlantes de laptop.
     *
     * Ahora usamos dos tonos cortos
     * en frecuencias claramente audibles.
     */

    playSingleTone(
      ctx,
      360,
      0.065,
      0.055,
      0,
      "square"
    );

    playSingleTone(
      ctx,
      250,
      0.085,
      0.045,
      0.045,
      "triangle"
    );
  }

  function playCollectSound() {
    if (
      !state.soundEnabled
    ) {
      return;
    }

    const ctx =
      getAudioContext();

    if (!ctx) {
      return;
    }

    playSingleTone(
      ctx,
      540,
      0.07,
      0.045,
      0,
      "sine"
    );

    playSingleTone(
      ctx,
      720,
      0.09,
      0.045,
      0.07,
      "sine"
    );
  }

  function playSuccessSequence() {
    if (
      !state.soundEnabled
    ) {
      return;
    }

    const ctx =
      getAudioContext();

    if (!ctx) {
      return;
    }

    playSingleTone(
      ctx,
      520,
      0.08,
      0.045,
      0,
      "sine"
    );

    playSingleTone(
      ctx,
      660,
      0.09,
      0.045,
      0.09,
      "sine"
    );

    playSingleTone(
      ctx,
      820,
      0.12,
      0.05,
      0.18,
      "sine"
    );
  }

  function playRestTone() {
    if (
      !state.soundEnabled
    ) {
      return;
    }

    const ctx =
      getAudioContext();

    if (!ctx) {
      return;
    }

    playSingleTone(
      ctx,
      360,
      0.11,
      0.03,
      0,
      "sine"
    );

    playSingleTone(
      ctx,
      280,
      0.14,
      0.026,
      0.11,
      "sine"
    );

    playSingleTone(
      ctx,
      210,
      0.19,
      0.022,
      0.24,
      "sine"
    );
  }

  function playSingleTone(
    ctx,
    frequency,
    duration,
    volume,
    delay = 0,
    waveType = "sine"
  ) {
    const oscillator =
      ctx.createOscillator();

    const gain =
      ctx.createGain();

    oscillator.type =
      waveType;

    oscillator.frequency.value =
      frequency;

    const start =
      ctx.currentTime +
      delay;

    gain.gain.setValueAtTime(
      Math.max(
        0.0001,
        volume
      ),
      start
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + duration
    );

    oscillator.connect(gain);

    gain.connect(
      ctx.destination
    );

    oscillator.start(start);

    oscillator.stop(
      start + duration
    );
  }

  function vibrate(pattern) {
    if (
      !CONFIG.feedback.vibration ||
      !(
        "vibrate" in navigator
      )
    ) {
      return;
    }

    try {
      navigator.vibrate(
        pattern
      );
    } catch (_) {}
  }

  // =========================================================
  // ESTILOS
  // =========================================================

  function injectV050Styles() {
    if (
      document.getElementById(
        "laberintos-v050-styles"
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "laberintos-v050-styles";

    style.textContent = `

      /*
       * =====================================================
       * GRID
       * =====================================================
       */

      #maze {
        position: relative !important;
        display: grid !important;
        gap: 0 !important;
        padding: 0 !important;
        margin-left: auto;
        margin-right: auto;
        max-width: none !important;
        max-height: none !important;
        min-width: 0 !important;
        min-height: 0 !important;
        box-sizing: content-box !important;
        overflow: hidden;
      }

      #maze > .cell.cell-v050 {
        position: relative !important;
        width: var(--cell-size) !important;
        height: var(--cell-size) !important;
        min-width: 0 !important;
        min-height: 0 !important;
        max-width: var(--cell-size) !important;
        max-height: var(--cell-size) !important;
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden;
        align-self: stretch;
        justify-self: stretch;
      }

      /*
       * =====================================================
       * OVERLAYS
       * =====================================================
       */

      #maze > #celebration,
      #maze > .rest-overlay-v050 {
        position: absolute !important;
        inset: 0 !important;
        width: auto !important;
        height: auto !important;
        margin: 0 !important;
        box-sizing: border-box !important;
        border-radius: inherit !important;
        overflow: hidden;
      }

      #maze > #celebration {
        z-index: 50;
      }

      .rest-overlay-v050 {
        z-index: 70;

        display: flex;
        align-items: center;
        justify-content: center;

        background:
          rgba(
            245,
            243,
            238,
            0.94
          );

        opacity: 0;
        visibility: hidden;
        pointer-events: none;

        transition:
          opacity 300ms ease,
          visibility 300ms ease;
      }

      .rest-overlay-v050.show {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }

      .rest-content-v050 {
        position: relative;

        width: 150px;
        height: 130px;

        display: flex;
        align-items: center;
        justify-content: center;
      }

      .rest-robot-v050 {
        position: relative !important;

        inset: auto !important;

        width: 100px !important;
        height: 100px !important;

        overflow: visible !important;

        transform:
          translateY(14px)
          rotate(8deg);
      }

      .rest-robot-v050
      .robot-v050 {
        transform:
          scale(1.45) !important;

        transform-origin:
          center center !important;
      }

      .robot-sleeping-v050 {
        animation:
          sleepingRobotV050
          2.8s
          ease-in-out
          infinite;
      }

      .sleeping-eye-v050 {
        height:
          2px !important;

        border-radius:
          999px !important;

        transform:
          translateY(2px);
      }

      .zzz-v050 {
        position: absolute;

        top: 0;
        right: 5px;

        width: 56px;
        height: 72px;

        pointer-events: none;
      }

      .zzz-v050 span {
        position: absolute;

        font-family:
          system-ui,
          sans-serif;

        font-weight: 700;

        opacity: 0;

        color:
          rgba(
            60,
            68,
            76,
            0.62
          );

        animation:
          zzzFloatV050
          2.4s
          ease-in-out
          infinite;
      }

      .zzz-v050 span:nth-child(1) {
        font-size: 16px;
        left: 2px;
        bottom: 2px;
        animation-delay: 0s;
      }

      .zzz-v050 span:nth-child(2) {
        font-size: 22px;
        left: 18px;
        bottom: 23px;
        animation-delay: 0.45s;
      }

      .zzz-v050 span:nth-child(3) {
        font-size: 30px;
        left: 28px;
        bottom: 43px;
        animation-delay: 0.9s;
      }

      /*
       * =====================================================
       * SESSION CONTROLS
       * =====================================================
       */

      .session-controls-v050 {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .session-timer-v050,
      .reset-level-v050 {
        position: relative;

        width: 48px;
        height: 48px;

        border:
          1px solid
          rgba(
            20,
            20,
            20,
            0.08
          );

        border-radius:
          999px;

        background:
          rgba(
            248,
            246,
            240,
            0.86
          );

        display: flex;
        align-items: center;
        justify-content: center;

        padding: 0;

        cursor: pointer;

        user-select: none;
        -webkit-user-select: none;

        touch-action: none;

        color:
          rgba(
            34,
            34,
            34,
            0.72
          );
      }

      .session-timer-v050 {
        --adult-hold-progress: 0deg;
      }

      .reset-level-v050 {
        width: 38px;
        height: 38px;
        opacity: 0.44;
        --reset-hold-progress: 0deg;
      }

      .reset-level-v050:hover {
        opacity: 0.7;
      }

      .reset-icon-v050 {
        font-size: 20px;
        line-height: 1;
      }

      .session-ring-v050 {
        position: absolute;
        inset: 2px;
        width: 44px;
        height: 44px;
        transform: rotate(-90deg);
        pointer-events: none;
      }

      .session-ring-track-v050,
      .session-ring-progress-v050 {
        fill: none;
        stroke-width: 3.2;
        vector-effect:
          non-scaling-stroke;
      }

      .session-ring-track-v050 {
        stroke:
          rgba(
            78,
            93,
            86,
            0.12
          );
      }

      .session-ring-progress-v050 {
        stroke: #7fa98d;
        stroke-linecap: round;

        transition:
          stroke 260ms ease,
          stroke-dashoffset 220ms linear;
      }

      .session-timer-v050.warning
      .session-ring-progress-v050 {
        stroke: #d59b66;
      }

      .session-timer-v050.rest
      .session-ring-progress-v050 {
        stroke:
          rgba(
            90,
            90,
            90,
            0.2
          );
      }

      .session-timer-icon-v050 {
        font-size: 17px;
        line-height: 1;
        opacity: 0.74;
        pointer-events: none;
      }

      .session-timer-v050.pulse {
        animation:
          sessionPulseV050
          1.35s
          ease-in-out
          infinite;
      }

      .adult-hold-progress-v050,
      .reset-hold-progress-v050 {
        position: absolute;
        inset: -3px;
        border-radius: 999px;
        pointer-events: none;
        opacity: 0;
      }

      .session-timer-v050.holding
      .adult-hold-progress-v050 {
        opacity: 1;

        background:
          conic-gradient(
            rgba(
              55,
              55,
              55,
              0.42
            )
            var(
              --adult-hold-progress
            ),
            transparent 0
          );

        -webkit-mask:
          radial-gradient(
            farthest-side,
            transparent
              calc(
                100% - 3px
              ),
            #000 0
          );

        mask:
          radial-gradient(
            farthest-side,
            transparent
              calc(
                100% - 3px
              ),
            #000 0
          );
      }

      .reset-level-v050.holding
      .reset-hold-progress-v050 {
        opacity: 1;

        background:
          conic-gradient(
            rgba(
              55,
              55,
              55,
              0.46
            )
            var(
              --reset-hold-progress
            ),
            transparent 0
          );

        -webkit-mask:
          radial-gradient(
            farthest-side,
            transparent
              calc(
                100% - 3px
              ),
            #000 0
          );

        mask:
          radial-gradient(
            farthest-side,
            transparent
              calc(
                100% - 3px
              ),
            #000 0
          );
      }

      .move-button.session-disabled-v050 {
        opacity: 0.28;
        cursor: default;
        pointer-events: none;
      }

      /*
       * =====================================================
       * GUÍA VISUAL
       * =====================================================
       */

      .mission-guide-v050 {
        min-height: 0;
        height: 0;

        opacity: 0;

        overflow: hidden;

        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;

        margin: 0;

        pointer-events: none;

        transition:
          opacity 180ms ease,
          height 180ms ease,
          margin 180ms ease;
      }

      .mission-guide-v050.show {
        height: 44px;
        min-height: 44px;
        opacity: 1;
        margin: 0 0 8px;
        overflow: visible;
      }

      .mission-step-v050 {
        width: 38px;
        height: 38px;

        border-radius: 12px;

        display: inline-flex;
        align-items: center;
        justify-content: center;

        position: relative;

        font-size: 24px;
        line-height: 1;

        box-sizing: border-box;

        background:
          rgba(
            255,
            255,
            255,
            0.72
          );

        border:
          2px solid
          rgba(
            28,
            28,
            28,
            0.12
          );
      }

      .mission-arrow-v050 {
        font-size: 24px;
        line-height: 1;
        opacity: 0.56;
      }

      .mission-active-v050 {
        border-color:
          rgba(
            28,
            28,
            28,
            0.42
          );

        animation:
          missionPulseV050
          1.55s
          ease-in-out
          infinite;
      }

      .mission-locked-v050 {
        opacity: 0.48;
      }

      .mission-lock-v050 {
        position: absolute;
        right: 1px;
        bottom: 1px;
        font-size: 13px;
        line-height: 1;
      }

      .mission-done-v050 {
        font-size: 25px;
        font-weight: 800;
        opacity: 0.62;
      }

      .mission-nudge-v050 {
        animation:
          missionNudgeV050
          420ms
          ease;
      }

      /*
       * =====================================================
       * META
       * =====================================================
       */

      .goal-v050 {
        position: absolute;
        inset: 3px;

        display: flex;
        align-items: center;
        justify-content: center;

        overflow: hidden;

        box-sizing: border-box;

        pointer-events: none;

        z-index: 2;
      }

      .goal-icon-v050 {
        display: flex;
        align-items: center;
        justify-content: center;

        width: 100%;
        height: 100%;

        font-size:
          calc(
            var(--cell-size) *
            0.58
          );

        line-height: 1;

        transform:
          scale(0.92);

        transform-origin:
          center;
      }

      .goal-lock-v050 {
        position: absolute;
        right: 0;
        bottom: 0;

        font-size:
          calc(
            var(--cell-size) *
            0.23
          );

        line-height: 1;

        z-index: 3;
      }

      .goal-locked-v050
      .goal-icon-v050 {
        opacity: 0.42;

        filter:
          grayscale(0.35);
      }

      /*
       * =====================================================
       * OBJETO
       * =====================================================
       */

      .collectible-v050 {
        position: absolute;
        inset: 3px;

        display: flex;
        align-items: center;
        justify-content: center;

        overflow: hidden;

        box-sizing: border-box;

        font-size:
          calc(
            var(--cell-size) *
            0.58
          );

        line-height: 1;

        z-index: 2;

        pointer-events: none;

        animation:
          collectiblePulseV050
          1.45s
          ease-in-out
          infinite;
      }

      /*
       * =====================================================
       * ROBOT BASE
       * =====================================================
       */

      .robot-safe-v050 {
        position: absolute;
        inset: 3px;

        display: flex;
        align-items: center;
        justify-content: center;

        overflow: hidden;

        box-sizing: border-box;

        z-index: 4;

        pointer-events: none;
      }

      .robot-safe-v050
      .robot {
        position: relative !important;
        top: auto !important;
        right: auto !important;
        bottom: auto !important;
        left: auto !important;
        margin: 0 !important;
      }

      /*
       * Tres robots.
       *
       * Se aprovecha la estructura
       * del robot original, pero cada
       * variante cambia formas y detalles.
       */

      .robot-v050 {
        --robot-main: #5e8ea3;
        --robot-dark: #395b69;
        --robot-face: #d9edf2;
        --robot-light: #ffd875;
      }

      .robot-v050
      .robot-head,
      .robot-v050
      .robot-body {
        box-sizing: border-box;
      }

      /*
       * Robot A
       */

      .robot-type-a {
        --robot-main: #5f8fa3;
        --robot-dark: #345866;
        --robot-face: #dceef1;
        --robot-light: #ffd773;
      }

      .robot-type-a
      .robot-head {
        background:
          var(--robot-main) !important;
      }

      .robot-type-a
      .robot-body {
        background:
          var(--robot-dark) !important;
      }

      /*
       * Robot B:
       * más redondeado
       */

      .robot-type-b {
        --robot-main: #7f9b73;
        --robot-dark: #52674b;
        --robot-face: #edf2df;
        --robot-light: #f2cf68;
      }

      .robot-type-b
      .robot-head {
        background:
          var(--robot-main) !important;

        border-radius:
          48% 48% 40% 40% !important;

        transform:
          scaleX(1.08);
      }

      .robot-type-b
      .robot-body {
        background:
          var(--robot-dark) !important;

        border-radius:
          45% 45% 38% 38% !important;
      }

      .robot-antenna-b-v050 {
        transform:
          rotate(-10deg);
      }

      /*
       * Robot C:
       * más compacto/cuadrado
       */

      .robot-type-c {
        --robot-main: #b47f69;
        --robot-dark: #765445;
        --robot-face: #f4e1d7;
        --robot-light: #f1c96c;
      }

      .robot-type-c
      .robot-head {
        background:
          var(--robot-main) !important;

        border-radius:
          5px !important;

        transform:
          scaleX(0.96);
      }

      .robot-type-c
      .robot-body {
        background:
          var(--robot-dark) !important;

        border-radius:
          4px !important;

        transform:
          scaleX(1.06);
      }

      .robot-antenna-c-v050 {
        transform:
          scaleX(0.72);
      }

      .robot-body-light-v050 {
        position: absolute;

        width: 5px;
        height: 5px;

        left: 50%;
        top: 50%;

        transform:
          translate(-50%, -50%);

        border-radius: 50%;

        background:
          var(--robot-light);

        box-shadow:
          0 0 0 1px
          rgba(
            0,
            0,
            0,
            0.09
          );
      }

      .robot-antenna-tip-v050 {
        position: absolute;

        width: 5px;
        height: 5px;

        left: 50%;
        top: -3px;

        transform:
          translateX(-50%);

        border-radius: 50%;

        background:
          var(--robot-light);
      }

      .start-cell-v050 {
        background-image:
          radial-gradient(
            circle at center,

            rgba(
              0,
              0,
              0,
              0.045
            ) 0,

            rgba(
              0,
              0,
              0,
              0.045
            ) 31%,

            transparent 33%
          );
      }

      /*
       * =====================================================
       * NUEVAS ANIMACIONES
       * =====================================================
       */

      /*
       * Exactamente dos rebotes
       * al recoger objeto.
       */

      .robot-v050.collect-bounce-v050 {
        animation:
          collectBounceV050
          620ms
          ease-out
          both !important;
      }

      /*
       * Exactamente tres rebotes
       * al completar.
       */

      .robot-v050.goal-bounce-v050 {
        animation:
          goalBounceV050
          900ms
          ease-out
          both !important;
      }

      @keyframes
      collectBounceV050 {
        0% {
          translate: 0 0;
        }

        18% {
          translate: 0 -20%;
        }

        34% {
          translate: 0 0;
        }

        55% {
          translate: 0 -20%;
        }

        72% {
          translate: 0 0;
        }

        100% {
          translate: 0 0;
        }
      }

      @keyframes
      goalBounceV050 {
        0% {
          translate: 0 0;
        }

        12% {
          translate: 0 -24%;
        }

        24% {
          translate: 0 0;
        }

        42% {
          translate: 0 -24%;
        }

        54% {
          translate: 0 0;
        }

        72% {
          translate: 0 -24%;
        }

        84% {
          translate: 0 0;
        }

        100% {
          translate: 0 0;
        }
      }

      /*
       * =====================================================
       * ANIMACIONES EXISTENTES
       * =====================================================
       */

      @keyframes
      sessionPulseV050 {
        0%,
        100% {
          transform:
            scale(1);
        }

        50% {
          transform:
            scale(1.055);
        }
      }

      @keyframes
      missionPulseV050 {
        0%,
        100% {
          transform:
            scale(1);
        }

        50% {
          transform:
            scale(1.08);
        }
      }

      @keyframes
      collectiblePulseV050 {
        0%,
        100% {
          transform:
            scale(0.88);
        }

        50% {
          transform:
            scale(0.98);
        }
      }

      @keyframes
      missionNudgeV050 {
        0%,
        100% {
          transform:
            translateX(0);
        }

        25% {
          transform:
            translateX(-5px);
        }

        50% {
          transform:
            translateX(5px);
        }

        75% {
          transform:
            translateX(-3px);
        }
      }

      @keyframes
      sleepingRobotV050 {
        0%,
        100% {
          transform:
            translateY(0)
            rotate(5deg);
        }

        50% {
          transform:
            translateY(3px)
            rotate(7deg);
        }
      }

      @keyframes
      zzzFloatV050 {
        0% {
          opacity: 0;
          transform:
            translate(
              0,
              4px
            )
            scale(0.85);
        }

        25% {
          opacity: 0.55;
        }

        70% {
          opacity: 0.8;
        }

        100% {
          opacity: 0;
          transform:
            translate(
              7px,
              -12px
            )
            scale(1.05);
        }
      }

      @media
      (
        prefers-reduced-motion:
        reduce
      ) {
        .session-timer-v050.pulse,
        .mission-active-v050,
        .collectible-v050,
        .mission-nudge-v050,
        .robot-sleeping-v050,
        .zzz-v050 span {
          animation:
            none !important;
        }

        .robot-v050.collect-bounce-v050,
        .robot-v050.goal-bounce-v050 {
          animation:
            none !important;
        }
      }
    `;

    document.head.appendChild(
      style
    );
  }

  // =========================================================
  // PERSISTENCIA NIVEL
  // =========================================================

  function loadSavedLevel() {
    try {
      const value =
        Number(
          localStorage.getItem(
            CONFIG.storage.levelKey
          )
        );

      if (
        !Number.isInteger(
          value
        ) ||
        value < 1
      ) {
        return 1;
      }

      return value;
    } catch (_) {
      return 1;
    }
  }

  function saveLevel(
    levelNumber
  ) {
    try {
      localStorage.setItem(
        CONFIG.storage.levelKey,
        String(
          levelNumber
        )
      );
    } catch (_) {}
  }

  // =========================================================
  // UTILIDADES
  // =========================================================

  function seededRandom(seed) {
    let value =
      seed >>> 0;

    return function random() {
      value +=
        0x6D2B79F5;

      let t =
        value;

      t =
        Math.imul(
          t ^
            (
              t >>> 15
            ),
          t | 1
        );

      t ^=
        t +
        Math.imul(
          t ^
            (
              t >>> 7
            ),
          t | 61
        );

      return (
        (
          t ^
          (
            t >>> 14
          )
        ) >>>
        0
      ) /
        4294967296;
    };
  }

  function shuffleCopy(
    array,
    rng = Math.random
  ) {
    const copy =
      array.map(
        (item) => ({
          ...item,
        })
      );

    for (
      let i =
        copy.length - 1;
      i > 0;
      i--
    ) {
      const j =
        Math.floor(
          rng() *
            (
              i + 1
            )
        );

      [
        copy[i],
        copy[j],
      ] = [
        copy[j],
        copy[i],
      ];
    }

    return copy;
  }

  function samePosition(
    a,
    b
  ) {
    return Boolean(
      a &&
      b &&
      a.row === b.row &&
      a.col === b.col
    );
  }

  function cellKey(
    row,
    col
  ) {
    return `${row}:${col}`;
  }

  function clamp(
    value,
    min,
    max
  ) {
    return Math.min(
      Math.max(
        value,
        min
      ),
      max
    );
  }

  function prefersReducedMotion() {
    return (
      window.matchMedia?.(
        "(prefers-reduced-motion: reduce)"
      )?.matches ??
      false
    );
  }
})();