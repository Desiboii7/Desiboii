import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const LANES = [-2.5, 0, 2.5];
const PLAYER_SPEED = 15;
const INITIAL_GAME_SPEED = 25; // Units per second
const SPEED_INCREMENT = 0.2; // Units per second per second
const JUMP_FORCE = 0.18;
const GRAVITY = 0.007;
const POWERUP_DURATION = 60; // 1 minute as requested

interface GameState {
  score: number;
  highScore: number;
  isGameOver: boolean;
  isStarted: boolean;
}

export const Game: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    highScore: parseInt(localStorage.getItem('subway-high-score') || '0'),
    isGameOver: false,
    isStarted: false,
  });

  const gameRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    player: THREE.Group;
    playerVelocityY: number;
    isJumping: boolean;
    isSliding: boolean;
    currentLane: number;
    targetX: number;
    obstacles: THREE.Object3D[];
    coins: THREE.Object3D[];
    gameSpeed: number;
    clock: THREE.Clock;
    mixer?: THREE.AnimationMixer;
    floorSegments: THREE.Mesh[];
    lastSpawnTime: number;
    slideTimer: number;
    score: number;
    isStarted: boolean;
    isGameOver: boolean;
    audio?: HTMLAudioElement;
    isMuted: boolean;
    powerUps: THREE.Object3D[];
    nitroTimer: number;
    magnetTimer: number;
    particles: THREE.Mesh[];
    stars: THREE.Points;
    nebulae: THREE.Group;
  } | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [activePowerUps, setActivePowerUps] = useState<{ nitro: number; magnet: number }>({ nitro: 0, magnet: 0 });
  const [showAnalyticsInfo, setShowAnalyticsInfo] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const startGame = () => {
    if (gameRef.current) {
      gameRef.current.isStarted = true;
      gameRef.current.isGameOver = false;
      gameRef.current.score = 0;
      gameRef.current.gameSpeed = INITIAL_GAME_SPEED;
      gameRef.current.nitroTimer = 0;
      gameRef.current.magnetTimer = 0;
      
      if (gameRef.current.audio && !gameRef.current.isMuted) {
        gameRef.current.audio.currentTime = 0;
        gameRef.current.audio.play().catch(e => console.log("Audio play failed:", e));
      }
      // Clear existing objects
      gameRef.current.obstacles.forEach(obj => gameRef.current?.scene.remove(obj));
      gameRef.current.coins.forEach(obj => gameRef.current?.scene.remove(obj));
      gameRef.current.powerUps.forEach(obj => gameRef.current?.scene.remove(obj));
      gameRef.current.particles.forEach(obj => gameRef.current?.scene.remove(obj));
      gameRef.current.obstacles = [];
      gameRef.current.coins = [];
      gameRef.current.powerUps = [];
      gameRef.current.particles = [];
      gameRef.current.player.position.set(0, 0.5, 0);
      gameRef.current.currentLane = 1;
      gameRef.current.targetX = LANES[1];
    }
    setGameState(prev => ({ ...prev, isStarted: true, isGameOver: false, score: 0 }));
  };

  const goHome = () => {
    if (gameRef.current) {
      gameRef.current.isStarted = false;
      gameRef.current.isGameOver = false;
      gameRef.current.score = 0;
      gameRef.current.nitroTimer = 0;
      gameRef.current.magnetTimer = 0;
      gameRef.current.powerUps.forEach(obj => gameRef.current?.scene.remove(obj));
      gameRef.current.particles.forEach(obj => gameRef.current?.scene.remove(obj));
      gameRef.current.powerUps = [];
      gameRef.current.particles = [];
      if (gameRef.current.audio) {
        gameRef.current.audio.pause();
      }
    }
    setGameState(prev => ({ ...prev, isStarted: false, isGameOver: false, score: 0 }));
  };

  const toggleMute = () => {
    if (gameRef.current) {
      gameRef.current.isMuted = !gameRef.current.isMuted;
      setIsMuted(gameRef.current.isMuted);
      if (gameRef.current.audio) {
        if (gameRef.current.isMuted) {
          gameRef.current.audio.pause();
        } else if (gameRef.current.isStarted && !gameRef.current.isGameOver) {
          gameRef.current.audio.play().catch(e => console.log("Audio play failed:", e));
        }
      }
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a0b2e); // Dark purple space
    scene.fog = new THREE.Fog(0x1a0b2e, 20, 120);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 6, 12);
    camera.lookAt(0, 1, -5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -10;
    dirLight.shadow.camera.right = 10;
    dirLight.shadow.camera.top = 10;
    dirLight.shadow.camera.bottom = -10;
    scene.add(dirLight);

    // Player (Verse Character)
    const playerGroup = new THREE.Group();
    
    // Torso (Blue Shirt)
    const torsoGeo = new THREE.CapsuleGeometry(0.35, 0.6, 4, 8);
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0x2b57d1 }); // Blue shirt
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 0.8;
    torso.castShadow = true;
    playerGroup.add(torso);

    // Head
    const headGeo = new THREE.SphereGeometry(0.28, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffdbac }); // Skin tone
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.45;
    head.castShadow = true;
    playerGroup.add(head);

    // Hair (Purple)
    const hairGeo = new THREE.SphereGeometry(0.32, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const hairMat = new THREE.MeshStandardMaterial({ color: 0xbf00ff }); // Purple hair
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 1.45;
    hair.rotation.x = -0.2;
    playerGroup.add(hair);

    // Ponytail
    const tailGeo = new THREE.CapsuleGeometry(0.1, 0.4, 4, 8);
    const tail = new THREE.Mesh(tailGeo, hairMat);
    tail.position.set(0.2, 1.3, -0.2);
    tail.rotation.z = -0.5;
    playerGroup.add(tail);

    // Legs (Blue pants/leggings)
    const legGeo = new THREE.CapsuleGeometry(0.12, 0.5, 4, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1a0b2e }); // Darker blue/purple
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.18, 0.3, 0);
    playerGroup.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.18, 0.3, 0);
    playerGroup.add(rightLeg);

    // Arms
    const armGeo = new THREE.CapsuleGeometry(0.08, 0.4, 4, 8);
    const leftArm = new THREE.Mesh(armGeo, torsoMat);
    leftArm.position.set(-0.45, 0.8, 0);
    leftArm.rotation.z = 0.2;
    playerGroup.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, torsoMat);
    rightArm.position.set(0.45, 0.8, 0);
    rightArm.rotation.z = -0.2;
    playerGroup.add(rightArm);

    scene.add(playerGroup);

    // Floor
    const floorSegments: THREE.Mesh[] = [];
    const createFloorSegment = (z: number) => {
      const geo = new THREE.PlaneGeometry(10, 50);
      const mat = new THREE.MeshStandardMaterial({ color: 0x221133 }); // Dark purple floor
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.z = z;
      mesh.receiveShadow = true;
      scene.add(mesh);
      
      // Lane lines (Neon glow)
      [-1.25, 1.25].forEach(x => {
        const lineGeo = new THREE.PlaneGeometry(0.15, 50);
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xbf00ff }); // Neon purple
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.set(x, 0.01, 0);
        mesh.add(line);
      });

      return mesh;
    };

    floorSegments.push(createFloorSegment(0));
    floorSegments.push(createFloorSegment(-50));

    // Stars & Nebulae (Parallax Background)
    const starsCount = 1000;
    const starsGeo = new THREE.BufferGeometry();
    const starsPos = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount; i++) {
      starsPos[i * 3] = (Math.random() - 0.5) * 200;
      starsPos[i * 3 + 1] = Math.random() * 100;
      starsPos[i * 3 + 2] = (Math.random() - 0.5) * 300;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, transparent: true, opacity: 0.8 });
    const stars = new THREE.Points(starsGeo, starsMat);
    scene.add(stars);

    const nebulae = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.SphereGeometry(20 + Math.random() * 30, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ 
        color: i % 2 === 0 ? 0xbf00ff : 0x2b57d1, 
        transparent: true, 
        opacity: 0.05,
        side: THREE.BackSide
      });
      const nebula = new THREE.Mesh(geo, mat);
      nebula.position.set(
        (Math.random() - 0.5) * 150,
        Math.random() * 50 + 20,
        -100 - Math.random() * 200
      );
      nebulae.add(nebula);
    }
    scene.add(nebulae);

    gameRef.current = {
      scene,
      camera,
      renderer,
      player: playerGroup,
      playerVelocityY: 0,
      isJumping: false,
      isSliding: false,
      currentLane: 1,
      targetX: LANES[1],
      obstacles: [],
      coins: [],
      gameSpeed: INITIAL_GAME_SPEED,
      clock: new THREE.Clock(),
      floorSegments,
      lastSpawnTime: 0,
      slideTimer: 0,
      score: 0,
      isStarted: false,
      isGameOver: false,
      isMuted: false,
      powerUps: [],
      nitroTimer: 0,
      magnetTimer: 0,
      particles: [],
      stars,
      nebulae,
    };

    // Audio Setup
    const audio = new Audio('https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3');
    audio.loop = true;
    audio.volume = 0.5;
    gameRef.current.audio = audio;

    // Unlock audio on first interaction
    const unlockAudio = () => {
      if (audio) {
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
        }).catch(e => console.log("Audio unlock failed:", e));
      }
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // Input Handling
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!gameRef.current || gameRef.current.isGameOver) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
          if (gameRef.current.currentLane > 0) {
            gameRef.current.currentLane--;
            gameRef.current.targetX = LANES[gameRef.current.currentLane];
          }
          break;
        case 'ArrowRight':
        case 'd':
          if (gameRef.current.currentLane < 2) {
            gameRef.current.currentLane++;
            gameRef.current.targetX = LANES[gameRef.current.currentLane];
          }
          break;
        case 'ArrowUp':
        case 'w':
        case ' ':
          if (!gameRef.current.isJumping && !gameRef.current.isSliding) {
            gameRef.current.isJumping = true;
            gameRef.current.playerVelocityY = JUMP_FORCE;
          }
          break;
        case 'ArrowDown':
        case 's':
          if (!gameRef.current.isSliding) {
            gameRef.current.isSliding = true;
            gameRef.current.slideTimer = 0.6; // 0.6 seconds slide
            gameRef.current.player.scale.y = 0.5;
            gameRef.current.player.position.y = 0.25;
            if (gameRef.current.isJumping) {
              gameRef.current.playerVelocityY = -0.2; // Fast fall
            }
          }
          break;
      }
    };

    // Touch Handling
    let touchStartX = 0;
    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;

      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > 30) {
          if (dx > 0) handleKeyDown({ key: 'ArrowRight' } as any);
          else handleKeyDown({ key: 'ArrowLeft' } as any);
        }
      } else {
        if (Math.abs(dy) > 30) {
          if (dy < 0) handleKeyDown({ key: 'ArrowUp' } as any);
          else handleKeyDown({ key: 'ArrowDown' } as any);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);

    // Animation Loop
    let lastScoreUpdate = 0;
    let runTime = 0;
    const animate = () => {
      if (!gameRef.current) return;
      const { scene, camera, renderer, player, floorSegments, obstacles, coins, clock, particles, stars, nebulae } = gameRef.current;
      const delta = clock.getDelta();

      requestAnimationFrame(animate);

      if (gameRef.current.isStarted && !gameRef.current.isGameOver) {
        runTime += delta * 15;
        
        // Update Game Speed
        gameRef.current.gameSpeed += SPEED_INCREMENT * delta;
        const nitroMultiplier = gameRef.current.nitroTimer > 0 ? 1.8 : 1.0;
        const currentSpeed = gameRef.current.gameSpeed * nitroMultiplier;

        // Parallax Background Movement
        // Stars move slowly
        stars.position.z += currentSpeed * delta * 0.2;
        if (stars.position.z > 100) stars.position.z -= 200;

        // Nebulae move even slower
        nebulae.children.forEach((nebula, i) => {
          nebula.position.z += currentSpeed * delta * (0.05 + i * 0.01);
          if (nebula.position.z > 50) nebula.position.z -= 300;
          nebula.rotation.y += delta * 0.1;
        });

        // Particle Trail
        if (Math.floor(runTime * 20) % 2 === 0) {
          const trailColor = gameRef.current.nitroTimer > 0 ? 0xffaa00 : 0x00ffff;
          spawnParticles(player.position.clone().add(new THREE.Vector3(0, 0, 0.5)), 1, trailColor, 0.2);
        }

        // Power-up Timers
        if (gameRef.current.nitroTimer > 0) {
          gameRef.current.nitroTimer -= delta;
        }
        if (gameRef.current.magnetTimer > 0) {
          gameRef.current.magnetTimer -= delta;
        }

        // Sync power-up state to UI periodically (every 0.5s)
        if (Math.floor(runTime * 2) !== Math.floor((runTime - delta * 15) * 2)) {
          setActivePowerUps({
            nitro: Math.max(0, Math.ceil(gameRef.current.nitroTimer)),
            magnet: Math.max(0, Math.ceil(gameRef.current.magnetTimer))
          });
        }

        // Player Lane Movement
        const targetX = gameRef.current.targetX;
        const dx = targetX - player.position.x;
        player.position.x += dx * 0.2;
        player.rotation.z = -dx * 0.1; // Tilt when moving

        // Procedural Run Animation
        if (!gameRef.current.isJumping && !gameRef.current.isSliding) {
          // Bobbing
          player.position.y = 0.5 + Math.abs(Math.sin(runTime)) * 0.1;
          
          // Leg movement (Indices 4 and 5 are legs in the new group)
          const leftLeg = player.children[4] as THREE.Mesh;
          const rightLeg = player.children[5] as THREE.Mesh;
          const leftArm = player.children[6] as THREE.Mesh;
          const rightArm = player.children[7] as THREE.Mesh;
          
          if (leftLeg && rightLeg) {
            leftLeg.position.z = Math.sin(runTime) * 0.3;
            rightLeg.position.z = -Math.sin(runTime) * 0.3;
            leftLeg.position.y = 0.3 + Math.max(0, Math.cos(runTime)) * 0.1;
            rightLeg.position.y = 0.3 + Math.max(0, -Math.cos(runTime)) * 0.1;
          }
          if (leftArm && rightArm) {
            leftArm.position.z = -Math.sin(runTime) * 0.4;
            rightArm.position.z = Math.sin(runTime) * 0.4;
            leftArm.rotation.x = Math.sin(runTime) * 0.5;
            rightArm.rotation.x = -Math.sin(runTime) * 0.5;
          }
        } else if (gameRef.current.isSliding) {
          // Reset for sliding
          const leftLeg = player.children[4] as THREE.Mesh;
          const rightLeg = player.children[5] as THREE.Mesh;
          if (leftLeg && rightLeg) {
            leftLeg.position.z = 0.2;
            rightLeg.position.z = 0.2;
            leftLeg.position.y = 0.3;
            rightLeg.position.y = 0.3;
          }
        }

        // Player Jump/Gravity
        if (gameRef.current.isJumping || player.position.y > 0.5) {
          gameRef.current.playerVelocityY -= GRAVITY;
          player.position.y += gameRef.current.playerVelocityY;

          if (player.position.y <= 0.5) {
            player.position.y = 0.5;
            gameRef.current.isJumping = false;
            gameRef.current.playerVelocityY = 0;
          }
        }

        // Player Slide
        if (gameRef.current.isSliding) {
          gameRef.current.slideTimer -= delta;
          if (gameRef.current.slideTimer <= 0) {
            gameRef.current.isSliding = false;
            player.scale.y = 1;
            player.position.y = 0.5;
          }
        }

        // Move Floor
        floorSegments.forEach(segment => {
          segment.position.z += currentSpeed * delta;
          if (segment.position.z > 50) {
            segment.position.z -= 100;
          }
        });

        // Spawn Obstacles & Coins
        gameRef.current.lastSpawnTime += delta;
        if (gameRef.current.lastSpawnTime > 25 / currentSpeed) {
          gameRef.current.lastSpawnTime = 0;
          spawnObstacleOrCoin();
        }

        // Move & Collide Obstacles
        for (let i = obstacles.length - 1; i >= 0; i--) {
          const obs = obstacles[i];
          obs.position.z += currentSpeed * delta;

          // Collision check
          const dist = player.position.distanceTo(obs.position);
          if (dist < 10) { // Broad check
            // Refined collision
            const dx = Math.abs(player.position.x - obs.position.x);
            const dz = Math.abs(player.position.z - obs.position.z);
            const dy = player.position.y - obs.position.y;

            // Obstacle specific collision boxes
            let hitWidth = 0.8;
            let hitDepth = 0.8;
            
            if (obs.userData.type === 'wall') {
              hitWidth = 2.2;
            } else if (obs.userData.type === 'train') {
              hitDepth = 5.0;
              hitWidth = 1.0;
            }

            if (dx < hitWidth && dz < hitDepth) {
              // Check if it's a high barrier and we are sliding
              const isHighBarrier = obs.userData.type === 'high_barrier';
              if (isHighBarrier && gameRef.current.isSliding) {
                // Safe
              } else if (!isHighBarrier && dy > 1.0) {
                // Jumped over
              } else {
                endGame();
              }
            }
          }

          if (obs.position.z > 15) {
            scene.remove(obs);
            obstacles.splice(i, 1);
          }
        }

        // Move & Collect Coins
        for (let i = coins.length - 1; i >= 0; i--) {
          const coin = coins[i];

          // Magnet Effect
          if (gameRef.current.magnetTimer > 0) {
            const dist = player.position.distanceTo(coin.position);
            if (dist < 12) {
              const dir = new THREE.Vector3().subVectors(player.position, coin.position).normalize();
              coin.position.add(dir.multiplyScalar(0.8));
            }
          }

          coin.position.z += currentSpeed * delta;
          coin.rotation.y += 0.05;

          if (player.position.distanceTo(coin.position) < 1.5) {
            scene.remove(coin);
            coins.splice(i, 1);
            gameRef.current.score += 10;
          }

          if (coin.position.z > 15) {
            scene.remove(coin);
            coins.splice(i, 1);
          }
        }

        // Move & Collect Power-ups
        const { powerUps } = gameRef.current;
        for (let i = powerUps.length - 1; i >= 0; i--) {
          const pu = powerUps[i];
          pu.position.z += currentSpeed * delta;
          pu.rotation.y += 0.05;

          if (player.position.distanceTo(pu.position) < 1.8) {
            scene.remove(pu);
            powerUps.splice(i, 1);
            if (pu.userData.type === 'nitro') {
              gameRef.current.nitroTimer = POWERUP_DURATION;
            } else if (pu.userData.type === 'magnet') {
              gameRef.current.magnetTimer = POWERUP_DURATION;
            }
          }

          if (pu.position.z > 15) {
            scene.remove(pu);
            powerUps.splice(i, 1);
          }
        }

        // Update Score by distance
        gameRef.current.score += Math.floor(currentSpeed * delta);

        // Update Particles
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.position.add(p.userData.velocity.clone().multiplyScalar(delta * 60));
          p.scale.multiplyScalar(0.95);
          p.userData.life -= delta;
          
          if (p.userData.life <= 0 || p.scale.x < 0.1) {
            scene.remove(p);
            particles.splice(i, 1);
          }
        }

        // Sync score to state periodically (every 0.1s)
        lastScoreUpdate += delta;
        if (lastScoreUpdate > 0.1) {
          lastScoreUpdate = 0;
          setGameState(prev => ({ ...prev, score: gameRef.current!.score }));
        }
      }

      renderer.render(scene, camera);
    };

    const spawnParticles = (pos: THREE.Vector3, count: number, color: number, size: number) => {
      if (!gameRef.current) return;
      const { scene, particles } = gameRef.current;
      
      for (let i = 0; i < count; i++) {
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
        const p = new THREE.Mesh(geo, mat);
        
        p.position.copy(pos);
        p.userData.velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2 + 0.1
        );
        p.userData.life = 1.0;
        
        scene.add(p);
        particles.push(p);
      }
    };

    const spawnObstacleOrCoin = () => {
      if (!gameRef.current) return;
      const { scene, obstacles, coins, powerUps } = gameRef.current;
      const lane = Math.floor(Math.random() * 3);
      const spawnType = Math.random();

      if (spawnType < 0.65) {
        // Obstacle
        const rand = Math.random();
        let obsType: 'barrier' | 'high_barrier' | 'lion' | 'train' | 'wall';
        if (rand < 0.2) obsType = 'barrier';
        else if (rand < 0.4) obsType = 'high_barrier';
        else if (rand < 0.6) obsType = 'lion';
        else if (rand < 0.8) obsType = 'train';
        else obsType = 'wall';

        let obs: THREE.Object3D;
        if (obsType === 'barrier') {
          const geo = new THREE.BoxGeometry(2, 1, 0.5);
          const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff }); // Neon pink
          obs = new THREE.Mesh(geo, mat);
          obs.position.set(LANES[lane], 0.5, -60);
        } else if (obsType === 'high_barrier') {
          const geo = new THREE.BoxGeometry(2, 0.5, 0.5);
          const mat = new THREE.MeshStandardMaterial({ color: 0x00ffff }); // Neon cyan
          obs = new THREE.Mesh(geo, mat);
          obs.position.set(LANES[lane], 2.2, -60); // High barrier
          
          // Add legs
          const legGeo = new THREE.BoxGeometry(0.2, 2.5, 0.2);
          const legMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
          const legL = new THREE.Mesh(legGeo, legMat);
          legL.position.set(-0.9, -1, 0);
          obs.add(legL);
          const legR = new THREE.Mesh(legGeo, legMat);
          legR.position.set(0.9, -1, 0);
          obs.add(legR);
        } else if (obsType === 'lion') {
          // Lion - taller and scarier
          const group = new THREE.Group();
          const bodyGeo = new THREE.BoxGeometry(1.2, 1.2, 2);
          const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd2a679 }); // Natural tan/orange
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          body.position.y = 0.6;
          group.add(body);

          const maneGeo = new THREE.BoxGeometry(1.6, 1.6, 0.6);
          const maneMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 }); // Natural dark brown mane
          const mane = new THREE.Mesh(maneGeo, maneMat);
          mane.position.set(0, 0.8, 0.8);
          group.add(mane);

          const headGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
          const head = new THREE.Mesh(headGeo, bodyMat);
          head.position.set(0, 0.8, 1.2);
          group.add(head);

          group.position.set(LANES[lane], 0, -60);
          obs = group;
        } else if (obsType === 'train') {
          // Train - long obstacle
          const geo = new THREE.BoxGeometry(2.2, 3, 10);
          const mat = new THREE.MeshStandardMaterial({ color: 0x2b57d1 });
          obs = new THREE.Mesh(geo, mat);
          obs.position.set(LANES[lane], 1.5, -65);
          
          // Windows
          for (let i = -4; i <= 4; i += 2) {
            const winGeo = new THREE.PlaneGeometry(0.8, 0.8);
            const winMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
            const winL = new THREE.Mesh(winGeo, winMat);
            winL.position.set(-1.11, 0.5, i);
            winL.rotation.y = -Math.PI / 2;
            obs.add(winL);
            const winR = new THREE.Mesh(winGeo, winMat);
            winR.position.set(1.11, 0.5, i);
            winR.rotation.y = Math.PI / 2;
            obs.add(winR);
          }
        } else {
          // Wall - spans two lanes
          const geo = new THREE.BoxGeometry(4.5, 4, 0.5);
          const mat = new THREE.MeshStandardMaterial({ color: 0x1a0b2e, metalness: 0.8, roughness: 0.2 });
          obs = new THREE.Mesh(geo, mat);
          
          // Randomly block left+middle or middle+right
          const side = Math.random() > 0.5 ? -1.25 : 1.25;
          obs.position.set(side, 2, -60);
          
          // Add some neon trim
          const trimGeo = new THREE.BoxGeometry(4.6, 0.1, 0.6);
          const trimMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
          const trimT = new THREE.Mesh(trimGeo, trimMat);
          trimT.position.y = 2;
          obs.add(trimT);
          const trimB = new THREE.Mesh(trimGeo, trimMat);
          trimB.position.y = -2;
          obs.add(trimB);
        }

        obs.userData.type = obsType;
        obs.castShadow = true;
        scene.add(obs);
        obstacles.push(obs);
      } else if (spawnType < 0.92) {
        // Coin (Verse Brand Coin)
        const group = new THREE.Group();
        const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.2 });
        const coin = new THREE.Mesh(geo, mat);
        coin.rotation.x = Math.PI / 2;
        group.add(coin);

        // "V" Logo on coin
        const vGeo = new THREE.BoxGeometry(0.1, 0.4, 0.05);
        const vMat = new THREE.MeshBasicMaterial({ color: 0xbf00ff });
        const vL = new THREE.Mesh(vGeo, vMat);
        vL.position.set(-0.1, 0, 0.06);
        vL.rotation.z = 0.4;
        group.add(vL);
        const vR = new THREE.Mesh(vGeo, vMat);
        vR.position.set(0.1, 0, 0.06);
        vR.rotation.z = -0.4;
        group.add(vR);

        group.position.set(LANES[lane], 0.8, -60);
        scene.add(group);
        coins.push(group);
      } else {
        // Power-up
        const puType = Math.random() > 0.5 ? 'nitro' : 'magnet';
        const group = new THREE.Group();
        
        // Base sphere
        const geo = new THREE.SphereGeometry(0.5, 16, 16);
        const mat = new THREE.MeshStandardMaterial({ 
          color: puType === 'nitro' ? 0xff4400 : 0x00ff00,
          emissive: puType === 'nitro' ? 0xff2200 : 0x00aa00,
          emissiveIntensity: 0.5,
          transparent: true,
          opacity: 0.8
        });
        const sphere = new THREE.Mesh(geo, mat);
        group.add(sphere);

        // Icon
        if (puType === 'nitro') {
          // Lightning bolt shape
          const boltGeo = new THREE.BoxGeometry(0.1, 0.6, 0.1);
          const boltMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
          const bolt = new THREE.Mesh(boltGeo, boltMat);
          bolt.rotation.z = 0.5;
          group.add(bolt);
        } else {
          // Magnet shape (U shape)
          const magGeo = new THREE.TorusGeometry(0.3, 0.1, 8, 16, Math.PI);
          const magMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
          const mag = new THREE.Mesh(magGeo, magMat);
          mag.rotation.x = Math.PI / 2;
          group.add(mag);
        }

        group.position.set(LANES[lane], 1.0, -60);
        group.userData.type = puType;
        scene.add(group);
        powerUps.push(group);
      }
    };

    const endGame = () => {
      if (!gameRef.current) return;
      gameRef.current.isGameOver = true;
      
      // Impact effect
      spawnParticles(gameRef.current.player.position, 20, 0xff0000, 0.5);

      if (gameRef.current.audio) {
        gameRef.current.audio.pause();
      }
      const finalScore = gameRef.current.score;
      setGameState(prev => {
        const newHighScore = Math.max(prev.highScore, finalScore);
        localStorage.setItem('subway-high-score', newHighScore.toString());
        return { ...prev, isGameOver: true, highScore: newHighScore, score: finalScore };
      });
    };

    animate();

    const handleResize = () => {
      if (!gameRef.current) return;
      const { camera, renderer } = gameRef.current;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-screen overflow-hidden bg-[#1a0b2e] font-sans">
      {/* Top Menu Bar */}
      <div className="absolute top-0 left-0 w-full h-16 bg-black/20 backdrop-blur-md border-b border-white/5 z-30 flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
            <span className="font-black text-white text-sm">V</span>
          </div>
          <span className="text-white font-black tracking-tighter text-lg">VERSE RUNNER</span>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center text-white z-50 cursor-pointer"
          >
            {showMenu ? '✕' : '☰'}
          </button>
        </div>

        {/* Dropdown Menu */}
        {showMenu && (
          <div className="absolute top-20 right-6 w-64 bg-[#1a0b2e]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="p-2 flex flex-col gap-1">
              <button 
                onClick={() => { toggleMute(); setShowMenu(false); }}
                className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/10 text-white flex items-center gap-3 transition-colors cursor-pointer"
              >
                <span className="text-lg">{isMuted ? '🔇' : '🔊'}</span>
                <span className="text-xs font-bold uppercase tracking-widest">{isMuted ? 'Unmute' : 'Mute'}</span>
              </button>
              
              {(gameState.isStarted || gameState.isGameOver) && (
                <button 
                  onClick={() => { goHome(); setShowMenu(false); }}
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/10 text-white flex items-center gap-3 transition-colors cursor-pointer"
                >
                  <span className="text-lg">🔙</span>
                  <span className="text-xs font-bold uppercase tracking-widest">Home</span>
                </button>
              )}

              <div className="h-px bg-white/5 my-1" />

              <a 
                href="https://t.me/GetVerse" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/10 text-white flex items-center gap-3 transition-colors"
                onClick={() => setShowMenu(false)}
              >
                <svg className="w-5 h-5 opacity-60" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.52-1.4.51-.46-.01-1.35-.26-2.01-.48-.81-.27-1.45-.42-1.39-.88.03-.24.36-.49.99-.75 3.88-1.69 6.46-2.8 7.74-3.33 3.68-1.53 4.44-1.8 4.94-1.81.11 0 .35.03.5.16.13.1.17.24.18.34.02.06.02.18-.01.29z"/></svg>
                <span className="text-xs font-bold uppercase tracking-widest">Telegram</span>
              </a>

              <a 
                href="https://x.com/VerseEcosystem" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/10 text-white flex items-center gap-3 transition-colors"
                onClick={() => setShowMenu(false)}
              >
                <svg className="w-5 h-5 opacity-60" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
                <span className="text-xs font-bold uppercase tracking-widest">X (Twitter)</span>
              </a>

              <div className="h-px bg-white/5 my-1" />

              <button 
                onClick={() => { setShowAnalyticsInfo(true); setShowMenu(false); }}
                className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/10 text-white flex items-center gap-3 transition-colors cursor-pointer"
              >
                <span className="text-lg">📊</span>
                <span className="text-xs font-bold uppercase tracking-widest">Analytics</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* UI Overlay */}
      <div className="absolute top-20 left-6 text-white drop-shadow-lg z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center border-2 border-white/20">
            <span className="font-black text-xl">V</span>
          </div>
          <div>
            <div className="text-3xl font-black tracking-tighter">VERSE RUNNER</div>
            <div className="text-sm font-bold opacity-70 uppercase tracking-widest">Score: {gameState.score}</div>
          </div>
        </div>

        {/* Power-up Indicators */}
        <div className="mt-4 flex flex-col gap-2">
          {activePowerUps.nitro > 0 && (
            <div className="flex items-center gap-2 bg-orange-500/80 backdrop-blur px-3 py-1 rounded-full border border-white/20 animate-pulse">
              <span className="text-lg">⚡</span>
              <span className="text-xs font-black uppercase tracking-tighter">Nitro Boost: {activePowerUps.nitro}s</span>
            </div>
          )}
          {activePowerUps.magnet > 0 && (
            <div className="flex items-center gap-2 bg-green-500/80 backdrop-blur px-3 py-1 rounded-full border border-white/20 animate-pulse">
              <span className="text-lg">🧲</span>
              <span className="text-xs font-black uppercase tracking-tighter">Coin Magnet: {activePowerUps.magnet}s</span>
            </div>
          )}
        </div>
      </div>

      {!gameState.isStarted && !gameState.isGameOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900/80 via-purple-900/80 to-indigo-900/80 backdrop-blur-md z-20">
          <div className="w-32 h-32 mb-6 rounded-3xl bg-white flex items-center justify-center shadow-2xl rotate-3">
             <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-600 via-purple-600 to-purple-500 flex items-center justify-center">
                <span className="text-white text-6xl font-black">V</span>
             </div>
          </div>
          <h1 className="text-7xl font-black text-white mb-2 tracking-tighter italic drop-shadow-2xl uppercase">Verse Runner</h1>
          <p className="text-white/60 font-bold mb-6 tracking-widest uppercase">The Ultimate Runner</p>
          
          <div className="mb-8 bg-black/30 p-6 rounded-2xl border border-white/10 max-w-md">
            <h3 className="text-white font-black text-center mb-4 uppercase tracking-widest text-sm">Avoid These Obstacles</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 text-white/80 text-xs font-bold">
                <div className="w-3 h-3 bg-pink-500 rounded-sm" /> Pink: Jump Over
              </div>
              <div className="flex items-center gap-3 text-white/80 text-xs font-bold">
                <div className="w-3 h-3 bg-cyan-500 rounded-sm" /> Cyan: Slide Under
              </div>
              <div className="flex items-center gap-3 text-white/80 text-xs font-bold">
                <div className="w-3 h-3 bg-purple-600 rounded-sm" /> Purple: Lion (Dodge)
              </div>
              <div className="flex items-center gap-3 text-white/80 text-xs font-bold">
                <div className="w-3 h-3 bg-blue-600 rounded-sm" /> Blue: Train (Dodge)
              </div>
            </div>
          </div>

          <div className="mb-8 bg-white/10 p-6 rounded-2xl border border-white/10 max-w-md w-full">
            <h3 className="text-white font-black text-center mb-4 uppercase tracking-widest text-sm">Power-Ups</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 text-white/80 text-xs font-bold">
                <span className="text-lg">⚡</span> Nitro: 1.8x Speed
              </div>
              <div className="flex items-center gap-3 text-white/80 text-xs font-bold">
                <span className="text-lg">🧲</span> Magnet: Attract Coins
              </div>
            </div>
            <p className="text-[10px] text-white/40 text-center mt-4 uppercase font-black">Lasts for 60 seconds!</p>
          </div>
          
          <button
            onClick={startGame}
            className="group relative px-16 py-5 bg-white text-indigo-900 font-black text-3xl rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.3)] overflow-hidden"
          >
            <span className="relative z-10">START RUN</span>
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-100 to-pink-100 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          </button>

          <div className="mt-12 flex gap-8 text-white/40 text-xs font-black uppercase tracking-widest">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border border-white/20 rounded-lg flex items-center justify-center">W</div>
              <span>Jump</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border border-white/20 rounded-lg flex items-center justify-center">S</div>
              <span>Slide</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border border-white/20 rounded-lg flex items-center justify-center">A/D</div>
              <span>Lane</span>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center gap-4 text-white/60">
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Contact Us</p>
            <div className="flex flex-col gap-4 items-center">
              <div className="flex gap-6 items-center">
                <a href="https://t.me/GetVerse" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors text-xs font-bold flex items-center gap-2">
                  <span className="opacity-50">TG:</span> @GetVerse
                </a>
                <a href="https://x.com/VerseEcosystem" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors text-xs font-bold flex items-center gap-2">
                  <span className="opacity-50">X:</span> @VerseEcosystem
                </a>
              </div>
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 max-w-md">
                <a href="https://t.me/TRAVI5s" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors text-[10px] font-bold">@TRAVI5s (Asst Staking Boss)</a>
                <a href="https://t.me/desi_boii7" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors text-[10px] font-bold">@desi_boii7 (STAKING BOSS)</a>
                <a href="https://x.com/olatravvis" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors text-[10px] font-bold">X: @olatravvis</a>
                <a href="https://x.com/_desiboii" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors text-[10px] font-bold">X: @_desiboii</a>
              </div>
            </div>
          </div>

          <div className="mt-auto pb-6 text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">
            built by Verse STAKING bosses(@desi_boii7, @TRAVI5s)🎮❤️🔥
          </div>
        </div>
      )}

      {gameState.isGameOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a0b2e]/90 backdrop-blur-xl z-20">
          <div className="text-purple-500 text-sm font-black tracking-[0.3em] uppercase mb-4">Game Over</div>
          <h2 className="text-8xl font-black text-white mb-2 italic tracking-tighter">BUSTED</h2>
          <div className="text-4xl text-white/80 mb-12 font-black tracking-tight">
            Score: <span className="text-white">{gameState.score}</span>
          </div>
          
          <button
            onClick={startGame}
            className="px-16 py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black text-3xl rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-2xl"
          >
            RESTART
          </button>

          <button
            onClick={goHome}
            className="mt-4 px-8 py-3 bg-white/10 hover:bg-white/20 text-white font-bold text-lg rounded-xl transition-all flex items-center gap-2"
          >
            🔙 BACK TO HOME
          </button>
          
          <div className="mt-8 text-white/30 font-bold">
            BEST: {gameState.highScore}
          </div>

          <div className="mt-auto pb-6 text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">
            built by Verse STAKING bosses(@desi_boii7, @TRAVI5s)🎮❤️🔥
          </div>
        </div>
      )}

      {showAnalyticsInfo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-[100] p-4 overflow-y-auto">
          <div className="bg-[#F8F9FA] w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl relative flex flex-col animate-in fade-in zoom-in duration-300">
            {/* Header */}
            <div className="p-6 flex items-center justify-between bg-white border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Verse Analytics</h3>
              </div>
              <button 
                onClick={() => setShowAnalyticsInfo(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Content Area */}
            <div className="p-6 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
              {/* Total Reach Card */}
              <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div className="bg-green-50 text-green-600 text-[10px] font-bold px-2 py-1 rounded-full">+12%</div>
                </div>
                <div className="text-4xl font-black text-gray-900 mb-1">132</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Reach</div>
              </div>

              {/* Active Nodes Card */}
              <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Live</span>
                  </div>
                </div>
                <div className="text-4xl font-black text-gray-900 mb-1">2</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Nodes</div>
              </div>

              {/* Total Events Card */}
              <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </div>
                <div className="text-4xl font-black text-gray-900 mb-1">5</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Events</div>
              </div>

              {/* Weekly Engagement Chart */}
              <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Weekly Engagement</h4>
                  <span className="text-[10px] font-bold text-gray-300">Last 7 Days</span>
                </div>
                <div className="flex items-end justify-between h-32 gap-2">
                  {[
                    { day: 'Mon', val: 40 },
                    { day: 'Tue', val: 55 },
                    { day: 'Wed', val: 45 },
                    { day: 'Thu', val: 85 },
                    { day: 'Fri', val: 35 },
                    { day: 'Sat', val: 60 },
                    { day: 'Sun', val: 75, active: true },
                  ].map((item, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative">
                      {item.active && (
                        <div className="absolute -top-10 bg-gray-900 text-white text-[10px] px-2 py-1 rounded-lg shadow-lg whitespace-nowrap z-10">
                          Sun visits: 24
                        </div>
                      )}
                      <div 
                        className={`w-full rounded-t-lg transition-all duration-500 ${item.active ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
                        style={{ height: `${item.val}%` }}
                      />
                      <span className="text-[10px] font-bold text-gray-400">{item.day}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabs Navigation */}
              <div className="bg-gray-100/50 p-1.5 rounded-2xl flex gap-1 mt-2">
                {['Upcoming', 'Live', 'Past', 'All'].map((tab, i) => (
                  <button 
                    key={tab}
                    className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${i === 0 ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 bg-white border-t border-gray-100">
              <button 
                onClick={() => setShowAnalyticsInfo(false)}
                className="w-full py-4 bg-gray-900 text-white font-black rounded-2xl hover:bg-black transition-all shadow-lg uppercase tracking-widest text-xs"
              >
                Close Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
