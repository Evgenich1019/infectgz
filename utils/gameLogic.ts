import { Player, Obstacle, Role, Point } from '../types';
import { 
  MAP_WIDTH, 
  MAP_HEIGHT, 
  PLAYER_SPEED, 
  ZOMBIE_SPEED_MULTIPLIER,
  VIEW_DISTANCE
} from '../constants';

// --- Math Helpers ---
export const getDistance = (p1: Point, p2: Point) => {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

export const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

export const lerp = (start: number, end: number, t: number) => {
  return start + (end - start) * t;
};

// Check intersection of line segment p1-p2 with obstacle rect
// Returns the intersection point or null
const getLineRectIntersection = (p1: Point, p2: Point, obs: Obstacle, padding = 0): { x: number, y: number, obs: Obstacle } | null => {
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);

  const obsLeft = obs.x - padding;
  const obsRight = obs.x + obs.width + padding;
  const obsTop = obs.y - padding;
  const obsBottom = obs.y + obs.height + padding;

  if (maxX < obsLeft || minX > obsRight || maxY < obsTop || minY > obsBottom) {
    return null;
  }
  
  // Simple check: is p2 inside?
  // We strictly want to know if we hit the wall moving from p1 to p2
  // We'll use a simplified AABB check against the segment for performance
  // If the center of the segment is inside, we count it.
  
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  
  if (midX > obsLeft && midX < obsRight && midY > obsTop && midY < obsBottom) {
      return { x: midX, y: midY, obs };
  }

  return null;
};

// --- Generation ---
export const generateObstacles = (): Obstacle[] => {
  const obstacles: Obstacle[] = [];
  const safeZoneRadius = 250; 

  const WALL_COUNT_LOCAL = 50; 
  const DEBRIS_COUNT_LOCAL = 80; 

  for (let i = 0; i < WALL_COUNT_LOCAL; i++) {
    const isHorizontal = Math.random() > 0.5;
    const length = Math.random() * 400 + 100;
    const thickness = 40; // Thicker walls are easier to navigate around

    const width = isHorizontal ? length : thickness;
    const height = isHorizontal ? thickness : length;

    let x = Math.random() * (MAP_WIDTH - width);
    let y = Math.random() * (MAP_HEIGHT - height);

    const centerDist = getDistance(
      { x: x + width / 2, y: y + height / 2 }, 
      { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }
    );
    if (centerDist < safeZoneRadius) continue;

    obstacles.push({ x, y, width, height });
  }

  for (let i = 0; i < DEBRIS_COUNT_LOCAL; i++) {
    const size = Math.random() * 50 + 30;
    let x = Math.random() * (MAP_WIDTH - size);
    let y = Math.random() * (MAP_HEIGHT - size);

    const centerDist = getDistance(
      { x: x + size / 2, y: y + size / 2 }, 
      { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }
    );
    if (centerDist < safeZoneRadius) continue;

    obstacles.push({ x, y, width: size, height: size });
  }

  return obstacles;
};

// --- Physics ---
export const resolveCollision = (player: Player, obstacles: Obstacle[]) => {
  player.x = clamp(player.x, player.radius, MAP_WIDTH - player.radius);
  player.y = clamp(player.y, player.radius, MAP_HEIGHT - player.radius);

  for (const obs of obstacles) {
    // Fast Broad phase
    if (player.x + player.radius < obs.x || player.x - player.radius > obs.x + obs.width ||
        player.y + player.radius < obs.y || player.y - player.radius > obs.y + obs.height) {
      continue;
    }

    const closestX = clamp(player.x, obs.x, obs.x + obs.width);
    const closestY = clamp(player.y, obs.y, obs.y + obs.height);

    const dx = player.x - closestX;
    const dy = player.y - closestY;

    const distanceSquared = dx * dx + dy * dy;

    if (distanceSquared < player.radius * player.radius && distanceSquared > 0.0001) {
      const distance = Math.sqrt(distanceSquared);
      const overlap = player.radius - distance;
      
      // Push out
      const nx = dx / distance;
      const ny = dy / distance;
      player.x += nx * overlap;
      player.y += ny * overlap;
    }
  }
};

// --- AI Logic (Steering with Sliding) ---
export const updateBot = (bot: Player, allPlayers: Player[], obstacles: Obstacle[]) => {
  if (!bot.isBot) return;

  const baseSpeed = bot.role === Role.ZOMBIE ? PLAYER_SPEED * ZOMBIE_SPEED_MULTIPLIER : PLAYER_SPEED;

  // 1. Perception & Separation
  let nearestEnemy: Player | null = null;
  let nearestDist = Infinity;
  
  let sepX = 0, sepY = 0, neighborCount = 0;

  for (const other of allPlayers) {
    if (bot.id === other.id) continue;
    const d = getDistance(bot, other);

    // Separation
    const separationRadius = 60; 
    if (d < separationRadius) {
      const force = (separationRadius - d) / separationRadius; 
      sepX += (bot.x - other.x) / (d + 0.1) * force;
      sepY += (bot.y - other.y) / (d + 0.1) * force;
      neighborCount++;
    }

    // Vision
    const isEnemy = (bot.role === Role.ZOMBIE && other.role === Role.SURVIVOR) ||
                    (bot.role === Role.SURVIVOR && other.role === Role.ZOMBIE);
    
    if (isEnemy) {
        const viewRange = bot.role === Role.SURVIVOR ? VIEW_DISTANCE * 1.5 : VIEW_DISTANCE * 1.3;
        if (d < viewRange && d < nearestDist) {
             // Simple raycast for vision
             // Check all obstacles for vision blocking
             let blocked = false;
             if (d > 60) {
                 for (const obs of obstacles) {
                     if (getLineRectIntersection(bot, other, obs, 5)) {
                         blocked = true; 
                         break;
                     }
                 }
             }

             if (!blocked) {
                 nearestDist = d;
                 nearestEnemy = other;
             }
        }
    }
  }

  if (neighborCount > 0) {
      sepX /= neighborCount;
      sepY /= neighborCount;
  }

  // 2. Determine Raw Desired Direction
  let targetX = 0;
  let targetY = 0;

  if (nearestEnemy) {
      // Chase / Flee
      const angle = Math.atan2(nearestEnemy.y - bot.y, nearestEnemy.x - bot.x);
      if (bot.role === Role.ZOMBIE) {
          targetX = Math.cos(angle);
          targetY = Math.sin(angle);
      } else {
          targetX = -Math.cos(angle);
          targetY = -Math.sin(angle);
      }
      
      // Randomly lose target if stuck to prevent eternal loops
      if (Math.random() < 0.005) bot.target = undefined;
  } else {
      // Roam
      if (!bot.target || getDistance(bot, bot.target) < 60) {
           let valid = false;
           let tries = 0;
           while(!valid && tries < 10) {
               const tx = Math.random() * (MAP_WIDTH - 100) + 50;
               const ty = Math.random() * (MAP_HEIGHT - 100) + 50;
               if (getDistance(bot, {x: tx, y: ty}) > 400) {
                   bot.target = { x: tx, y: ty };
                   valid = true;
               }
               tries++;
           }
      }
      
      const angle = Math.atan2(bot.target!.y - bot.y, bot.target!.x - bot.x);
      targetX = Math.cos(angle);
      targetY = Math.sin(angle);
  }

  // Combine Separation
  // Separation weight should be moderate
  targetX += sepX * 2.0;
  targetY += sepY * 2.0;

  // Normalize
  let len = Math.sqrt(targetX * targetX + targetY * targetY);
  if (len > 0.001) {
      targetX /= len;
      targetY /= len;
  }

  // 3. Wall Sliding (The Fix)
  // Instead of turning away, we project our vector onto the wall plane
  
  const lookAhead = 60; // Distance to check for walls ahead
  const pNext = { 
      x: bot.x + targetX * lookAhead, 
      y: bot.y + targetY * lookAhead 
  };

  let wallHit: Obstacle | null = null;
  
  // Check collisions with desired path
  for (const obs of obstacles) {
      // Broad phase
      if (bot.x + lookAhead < obs.x || bot.x - lookAhead > obs.x + obs.width) continue;
      
      const intersect = getLineRectIntersection(bot, pNext, obs, 10);
      if (intersect) {
          wallHit = obs;
          break; // React to the first wall we hit
      }
  }

  if (wallHit) {
      // Calculate Surface Normal
      // We compare bot center to obstacle center/edges
      const dx = (bot.x) - (wallHit.x + wallHit.width / 2);
      const dy = (bot.y) - (wallHit.y + wallHit.height / 2);
      const hw = (wallHit.width / 2);
      const hh = (wallHit.height / 2);
      
      // Calculate penetration depth or distance to edges
      const ox = Math.abs(dx) - hw;
      const oy = Math.abs(dy) - hh;
      
      let nx = 0, ny = 0;
      
      // If we are closer to X edge
      if (ox > oy) {
          nx = Math.sign(dx); // 1 if right, -1 if left
          ny = 0;
      } else {
          nx = 0;
          ny = Math.sign(dy); // 1 if bottom, -1 if top
      }
      
      // Project Vector: V_new = V - (V . N) * N
      const dot = targetX * nx + targetY * ny;
      
      // Only slide if we are moving INTO the wall
      if (dot < 0) {
          targetX = targetX - nx * dot;
          targetY = targetY - ny * dot;
          
          // Add a small push AWAY from the wall to prevent sticking
          targetX += nx * 0.5;
          targetY += ny * 0.5;
          
          // Re-normalize to maintain speed
          const slideLen = Math.sqrt(targetX * targetX + targetY * targetY);
          if (slideLen > 0.001) {
              targetX /= slideLen;
              targetY /= slideLen;
          }
      }
  }

  // 4. Apply
  // Low lerp for smooth turns, higher for responsive collision avoidance
  const smoothing = wallHit ? 0.5 : 0.1;
  
  bot.dx = lerp(bot.dx, targetX, smoothing);
  bot.dy = lerp(bot.dy, targetY, smoothing);

  bot.x += bot.dx * baseSpeed;
  bot.y += bot.dy * baseSpeed;

  resolveCollision(bot, obstacles);
};
