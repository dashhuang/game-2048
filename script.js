// 全局变量
let touchStartX = null;
let touchStartY = null;
let animationId = null;

class Game2048 {
    constructor() {
        this.size = 4;
        this.grid = [];
        this.score = 0;
        this.bestScore = localStorage.getItem('bestScore') || 0;
        
        // 撤销系统
        this.stateHistory = []; // 历史状态栈
        this.maxHistorySize = 100; // 最多保存100个历史状态
        this.initialUndoCount = 3; // 初始撤销次数
        this.undoCount = this.initialUndoCount; // 当前可用撤销次数
        this.maxUndoCount = 10; // 最大累计撤销次数
        this.undoRewardValue = 256; // 每合成256的倍数获得撤销次数
        
        this.tileContainer = document.getElementById('tile-container');
        this.scoreDisplay = document.getElementById('score');
        this.bestScoreDisplay = document.getElementById('best-score');
        this.messageContainer = document.getElementById('game-message');
        
        this.startX = 0;
        this.startY = 0;
        this.endX = 0;
        this.endY = 0;
        
        this.tiles = {}; // 保存方块DOM元素的引用
        this.tileId = 0; // 用于生成唯一的方块ID
        
        // 随机数生成器
        this.randomSeed = Date.now(); // 初始种子
        this.random = this.createSeededRandom(this.randomSeed);
        
        // 动画状态标志
        this.isAnimating = false;
        
        // 拖动预览相关
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.currentDragX = 0;
        this.currentDragY = 0;
        this.dragDirection = null;
        this.dragDistance = 0;
        this.previewOffset = { x: 0, y: 0 };
        this.minDragDistance = 30; // 触发移动的最小距离
        this.dragThreshold = 10; // 开始显示拖动效果的阈值
        
        // 快速滑动检测
        this.dragStartTime = 0;
        this.quickSwipeThreshold = 300; // 增加到300ms，让更多滑动被识别为快速滑动
        this.quickSwipeEnabled = true;
        this.lastTouchMoveTime = 0;
        this.touchMoveThrottle = 32; // 约30fps的节流，减少性能开销
        
        // 拖动预览开关（可以在低端设备上禁用）
        this.dragPreviewEnabled = true;
        // 检测是否是移动设备
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        // 在旧设备上默认禁用拖动预览
        if (isMobile && window.innerWidth <= 400) {
            this.dragPreviewEnabled = true; // 保持开启，但可以根据需要改为false
        }
        
        this.setup();
        this.updateDisplay();
        
        // 防止页面滚动
        this.preventPageScroll();
        
        // 修复iOS视口高度问题
        this.fixViewportHeight();
    }
    
    preventPageScroll() {
        // 暂时注释掉，可能影响iOS全屏显示
        // document.body.addEventListener('touchmove', (e) => {
        //     e.preventDefault();
        // }, { passive: false });
    }
    
    fixViewportHeight() {
        // 设置正确的视口高度，修复iOS上的问题
        const setVH = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        // 初始设置
        setVH();
        
        // 监听窗口大小变化
        window.addEventListener('resize', setVH);
        window.addEventListener('orientationchange', setVH);
    }
    
    setup() {
        // 初始化网格
        for (let i = 0; i < this.size; i++) {
            this.grid[i] = [];
            for (let j = 0; j < this.size; j++) {
                this.grid[i][j] = null;
            }
        }
        
        // 添加两个初始方块
        this.addNewTile();
        this.addNewTile();
        
        // 保存初始状态
        this.saveState();
        
        // 设置事件监听器
        this.setupEventListeners();
        
        // 更新最高分显示
        this.bestScoreDisplay.textContent = this.bestScore;
        
        // 更新撤销按钮
        this.updateUndoButton();
        
        // 启动液态玻璃动画
        this.startLiquidAnimation();
    }
    
    createSeededRandom(seed) {
        // 创建基于种子的伪随机数生成器
        let currentSeed = seed;
        
        return {
            // 生成0到1之间的随机数
            random: () => {
                // 使用线性同余生成器（LCG）算法
                currentSeed = (currentSeed * 1664525 + 1013904223) % 2147483647;
                return currentSeed / 2147483647;
            },
            // 获取当前种子
            getSeed: () => currentSeed,
            // 设置新种子
            setSeed: (newSeed) => {
                currentSeed = newSeed;
            }
        };
    }
    
    setupEventListeners() {
        // 避免重复绑定，先存储事件处理器
        if (!this.keydownHandler) {
            this.keydownHandler = (e) => {
                const keyMap = {
                    37: 'left',  // Left arrow
                    65: 'left',  // A
                    38: 'up',    // Up arrow
                    87: 'up',    // W
                    39: 'right', // Right arrow
                    68: 'right', // D
                    40: 'down',  // Down arrow
                    83: 'down'   // S
                };
                
                const direction = keyMap[e.keyCode];
                if (direction) {
                    e.preventDefault();
                    this.move(direction);
                }

                // 测试快捷键
                if (e.keyCode === 57) { // "9" key
                    e.preventDefault();
                    this.showMessage('你赢了!', 'game-won');
                }
                if (e.keyCode === 48) { // "0" key
                    e.preventDefault();
                    this.showMessage('无路可走!', 'game-stuck');
                }
            };
        }
        
        // 移除可能存在的旧监听器，然后添加新的
        document.removeEventListener('keydown', this.keydownHandler);
        document.addEventListener('keydown', this.keydownHandler);
        
        // 触摸事件 - 实现拖动预览效果
        document.addEventListener('touchstart', (e) => {
            // 排除按钮点击
            if (e.target.closest('button')) return;
            
            // 如果还在动画中，不开始新的拖动
            if (this.isAnimating) return;
            
            this.isDragging = true;
            this.dragStartX = e.touches[0].clientX;
            this.dragStartY = e.touches[0].clientY;
            this.currentDragX = this.dragStartX;
            this.currentDragY = this.dragStartY;
            this.dragDirection = null;
            this.dragDistance = 0;
            this.dragStartTime = Date.now(); // 记录开始时间
            
            // 只在必要时重置砖块状态
            // 检查是否有砖块还有残留的transform
            const needsReset = Object.values(this.tiles).some(tile => {
                const transform = tile.style.transform;
                return transform && transform !== '' && transform !== 'translate(0, 0) scale(1) rotate(0deg)';
            });
            
            if (needsReset) {
                this.forceResetAllTiles();
            }
            
            // 添加拖动状态类到游戏容器
            this.tileContainer.classList.add('dragging-active');
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            if (!this.isDragging || this.isAnimating) return;
            
            const currentTime = Date.now();
            
            // 节流处理，减少更新频率
            if (currentTime - this.lastTouchMoveTime < this.touchMoveThrottle) {
                return;
            }
            this.lastTouchMoveTime = currentTime;
            
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const diffX = currentX - this.dragStartX;
            const diffY = currentY - this.dragStartY;
            
            this.currentDragX = currentX;
            this.currentDragY = currentY;
            
            // 计算拖动方向和距离
            const absDiffX = Math.abs(diffX);
            const absDiffY = Math.abs(diffY);
            
            // 只有超过阈值才开始显示拖动效果
            if (absDiffX > this.dragThreshold || absDiffY > this.dragThreshold) {
                e.preventDefault(); // 防止页面滚动
                
                // 确定主要拖动方向
                if (absDiffX > absDiffY) {
                    this.dragDirection = diffX > 0 ? 'right' : 'left';
                    this.dragDistance = absDiffX;
                } else {
                    this.dragDirection = diffY > 0 ? 'down' : 'up';
                    this.dragDistance = absDiffY;
                }
                
                // 检测是否是快速滑动
                const dragDuration = currentTime - this.dragStartTime;
                const isQuickSwipe = dragDuration < this.quickSwipeThreshold && this.dragDistance > this.minDragDistance;
                
                // 只有在慢速拖动且启用了拖动预览时才更新预览效果
                if (!isQuickSwipe && this.quickSwipeEnabled && this.dragPreviewEnabled) {
                    this.updateDragPreview(diffX, diffY);
                }
            }
        }, { passive: false });
        
        document.addEventListener('touchend', (e) => {
            if (!this.isDragging) return;
            
            this.isDragging = false;
            
            // 移除拖动状态类
            this.tileContainer.classList.remove('dragging-active');
            
            // 计算滑动时长
            const dragDuration = Date.now() - this.dragStartTime;
            const isQuickSwipe = dragDuration < this.quickSwipeThreshold;
            
            // 执行移动动画
            if (this.dragDirection && this.dragDistance > this.minDragDistance) {
                if (isQuickSwipe && this.quickSwipeEnabled) {
                    // 快速滑动：确保砖块的transform被重置后再执行移动
                    // 使用更快的重置动画
                    Object.values(this.tiles).forEach(tile => {
                        tile.classList.remove('dragging');
                        tile.style.transition = 'transform 0.08s ease-out';
                        tile.style.transform = '';
                    });
                    
                    // 短暂延迟后执行移动，让重置动画完成
                    setTimeout(() => {
                        this.move(this.dragDirection);
                    }, 80);
                } else {
                    // 慢速拖动：从拖动预览状态平滑过渡到实际移动
                    this.transitionFromDragToMove(this.dragDirection);
                }
            } else {
                // 如果没有达到移动阈值，恢复原位
                this.resetTileTransforms();
            }
        }, { passive: true });
        
        // 处理触摸取消事件
        document.addEventListener('touchcancel', (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                this.tileContainer.classList.remove('dragging-active');
                this.resetTileTransforms();
            }
        }, { passive: true });
        
        // 鼠标事件支持（桌面端）
        let mouseDown = false;
        
        document.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            
            // 如果还在动画中，不开始新的拖动
            if (this.isAnimating) return;
            
            mouseDown = true;
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.currentDragX = this.dragStartX;
            this.currentDragY = this.dragStartY;
            this.dragDirection = null;
            this.dragDistance = 0;
            this.dragStartTime = Date.now(); // 记录开始时间
            
            // 确保所有砖块都在正确的位置
            this.forceResetAllTiles();
            this.tileContainer.classList.add('dragging-active');
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!mouseDown || !this.isDragging || this.isAnimating) return;
            
            const diffX = e.clientX - this.dragStartX;
            const diffY = e.clientY - this.dragStartY;
            
            this.currentDragX = e.clientX;
            this.currentDragY = e.clientY;
            
            const absDiffX = Math.abs(diffX);
            const absDiffY = Math.abs(diffY);
            
            if (absDiffX > this.dragThreshold || absDiffY > this.dragThreshold) {
                if (absDiffX > absDiffY) {
                    this.dragDirection = diffX > 0 ? 'right' : 'left';
                    this.dragDistance = absDiffX;
                } else {
                    this.dragDirection = diffY > 0 ? 'down' : 'up';
                    this.dragDistance = absDiffY;
                }
                
                this.updateDragPreview(diffX, diffY);
            }
        });
        
        document.addEventListener('mouseup', (e) => {
            if (!mouseDown) return;
            
            mouseDown = false;
            this.isDragging = false;
            this.tileContainer.classList.remove('dragging-active');
            
            // 检查是否是快速滑动（鼠标也支持快速滑动）
            const dragDuration = Date.now() - this.dragStartTime;
            const isQuickSwipe = dragDuration < this.quickSwipeThreshold;
            
            if (this.dragDirection && this.dragDistance > this.minDragDistance) {
                if (isQuickSwipe && this.quickSwipeEnabled) {
                    // 快速滑动：与触摸处理一致
                    Object.values(this.tiles).forEach(tile => {
                        tile.classList.remove('dragging');
                        tile.style.transition = 'transform 0.08s ease-out';
                        tile.style.transform = '';
                    });
                    
                    setTimeout(() => {
                        this.move(this.dragDirection);
                    }, 80);
                } else {
                    // 慢速拖动：从拖动预览状态平滑过渡到实际移动
                    this.transitionFromDragToMove(this.dragDirection);
                }
            } else {
                this.resetTileTransforms();
            }
        });
    }
    
    handleSwipe() {
        const diffX = this.endX - this.startX;
        const diffY = this.endY - this.startY;
        const minSwipeDistance = 30; // 降低最小滑动距离，让滑动更容易触发
        
        if (Math.abs(diffX) > Math.abs(diffY)) {
            // 水平滑动
            if (Math.abs(diffX) > minSwipeDistance) {
                if (diffX > 0) {
                    this.move('right');
                } else {
                    this.move('left');
                }
            }
        } else {
            // 垂直滑动
            if (Math.abs(diffY) > minSwipeDistance) {
                if (diffY > 0) {
                    this.move('down');
                } else {
                    this.move('up');
                }
            }
        }
    }
    
    move(direction) {
        // 如果正在动画中或正在拖动，忽略移动
        if (this.isAnimating || this.isDragging) return;
        
        const movements = [];
        const merges = [];
        let moved = false;
        
        // 创建新的网格来存储结果
        const newGrid = [];
        for (let i = 0; i < this.size; i++) {
            newGrid[i] = [];
            for (let j = 0; j < this.size; j++) {
                newGrid[i][j] = null;
            }
        }
        
        // 根据方向处理移动
        if (direction === 'left') {
            for (let row = 0; row < this.size; row++) {
                const result = this.processLine(this.getRow(row), row, 0, 0, 1);
                moved = result.moved || moved;
                movements.push(...result.movements);
                merges.push(...result.merges);
                this.setRow(newGrid, row, result.line);
            }
        } else if (direction === 'right') {
            for (let row = 0; row < this.size; row++) {
                const result = this.processLine(this.getRow(row).reverse(), row, 3, 0, -1);
                moved = result.moved || moved;
                movements.push(...result.movements);
                merges.push(...result.merges);
                this.setRow(newGrid, row, result.line.reverse());
            }
        } else if (direction === 'up') {
            for (let col = 0; col < this.size; col++) {
                const result = this.processLine(this.getColumn(col), 0, col, 1, 0);
                moved = result.moved || moved;
                movements.push(...result.movements);
                merges.push(...result.merges);
                this.setColumn(newGrid, col, result.line);
            }
        } else if (direction === 'down') {
            for (let col = 0; col < this.size; col++) {
                const result = this.processLine(this.getColumn(col).reverse(), 3, col, -1, 0);
                moved = result.moved || moved;
                movements.push(...result.movements);
                merges.push(...result.merges);
                this.setColumn(newGrid, col, result.line.reverse());
            }
        }
        
        if (moved) {
            // 设置动画标志
            this.isAnimating = true;
            
            // 更新网格
            this.grid = newGrid;
            
            // 执行动画
            this.animateMovements(movements, merges, () => {
                // 动画完成后添加新方块
                this.addNewTile();
                
                // 修复：先保存状态，再更新显示
                this.saveState();
                this.updateDisplay();
                
                // 清除动画标志
                this.isAnimating = false;
                
                // 游戏状态检查
                if (this.checkWin()) {
                    this.showMessage('你赢了!', 'game-won');
                } else if (this.checkGameOver()) {
                    // 只有在没有撤销次数时才真正结束游戏
                    if (this.undoCount === 0) {
                        this.showMessage('游戏结束', 'game-over');
                    } else {
                        // 如果还有撤销次数，给用户提示
                        this.showMessage('无路可走!', 'game-stuck');
                    }
                }
            });
        }
    }
    
    processLine(line, startRow, startCol, rowDir, colDir) {
        const movements = [];
        const merges = [];
        const result = [];
        let moved = false;
        
        // 第一步：移除空格，收集所有非空方块
        const tiles = [];
        for (let i = 0; i < line.length; i++) {
            if (line[i] !== null) {
                tiles.push({
                    tile: line[i],
                    originalIndex: i
                });
            }
        }
        
        // 第二步：处理合并
        let resultIndex = 0;
        let i = 0;
        
        while (i < tiles.length) {
            const currentTile = tiles[i];
            const fromRow = startRow + currentTile.originalIndex * rowDir;
            const fromCol = startCol + currentTile.originalIndex * colDir;
            const toRow = startRow + resultIndex * rowDir;
            const toCol = startCol + resultIndex * colDir;
            
            // 检查是否需要移动
            if (fromRow !== toRow || fromCol !== toCol) {
                movements.push({
                    tile: currentTile.tile,
                    from: { row: fromRow, col: fromCol },
                    to: { row: toRow, col: toCol }
                });
                moved = true;
            }
            
            // 检查是否可以合并
            if (i + 1 < tiles.length && 
                currentTile.tile.value === tiles[i + 1].tile.value &&
                !currentTile.tile.merged) {
                
                // 创建合并后的方块
                const mergedTile = {
                    id: this.tileId++,
                    value: currentTile.tile.value * 2,
                    merged: true
                };
                
                // 记录第二个方块的移动（移动到合并位置）
                const nextTile = tiles[i + 1];
                const nextFromRow = startRow + nextTile.originalIndex * rowDir;
                const nextFromCol = startCol + nextTile.originalIndex * colDir;
                
                movements.push({
                    tile: nextTile.tile,
                    from: { row: nextFromRow, col: nextFromCol },
                    to: { row: toRow, col: toCol }
                });
                
                // 记录合并
                merges.push({
                    tiles: [currentTile.tile, nextTile.tile],
                    result: mergedTile,
                    position: { row: toRow, col: toCol }
                });
                
                result.push(mergedTile);
                this.score += mergedTile.value;
                moved = true;
                
                // 检查是否合成了256的倍数，奖励撤销次数
                if (mergedTile.value >= this.undoRewardValue && 
                    mergedTile.value % this.undoRewardValue === 0) {
                    this.earnUndoReward();
                }
                
                i += 2; // 跳过已合并的两个方块
            } else {
                result.push(currentTile.tile);
                i += 1;
            }
            
            resultIndex++;
        }
        
        // 第三步：填充空格
        while (result.length < this.size) {
            result.push(null);
        }
        
        return { line: result, moved, movements, merges };
    }
    
    getRow(row) {
        return this.grid[row].slice();
    }
    
    setRow(grid, row, values) {
        grid[row] = values;
    }
    
    getColumn(col) {
        const column = [];
        for (let i = 0; i < this.size; i++) {
            column.push(this.grid[i][col]);
        }
        return column;
    }
    
    setColumn(grid, col, values) {
        for (let i = 0; i < this.size; i++) {
            grid[i][col] = values[i];
        }
    }
    
    animateMovements(movements, merges, callback) {
        // 移动所有方块
        movements.forEach(movement => {
            const tile = this.tiles[movement.tile.id];
            if (tile) {
                const { top, left } = this.getPosition(movement.to.row, movement.to.col);
                tile.style.top = top;
                tile.style.left = left;
            }
        });
        
        // 120ms后处理合并（与CSS动画时间一致）
        setTimeout(() => {
            merges.forEach(merge => {
                // 移除被合并的方块
                merge.tiles.forEach(tile => {
                    if (this.tiles[tile.id]) {
                        this.tiles[tile.id].remove();
                        delete this.tiles[tile.id];
                    }
                });
                
                // 创建新的合并后的方块
                this.createTileElement(
                    merge.position.row, 
                    merge.position.col, 
                    merge.result,
                    false,
                    true
                );
            });
            
            // 触发液态爆发效果
            if (merges.length > 0) {
                this.liquidBurst();
            }
            
            // 更新分数显示
            this.scoreDisplay.textContent = this.score;
            if (this.score > this.bestScore) {
                this.bestScore = this.score;
                this.bestScoreDisplay.textContent = this.bestScore;
                localStorage.setItem('bestScore', this.bestScore);
            }
            
            // 再等待一小段时间后执行回调
            setTimeout(callback, 30);
        }, 120);
    }
    
    addNewTile() {
        const emptyCells = [];
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (this.grid[i][j] === null) {
                    emptyCells.push({row: i, col: j});
                }
            }
        }
        
        if (emptyCells.length > 0) {
            const randomCell = emptyCells[Math.floor(this.random.random() * emptyCells.length)];
            const value = this.random.random() < 0.9 ? 2 : 4;
            const newTile = {
                id: this.tileId++,
                value: value,
                merged: false
            };
            this.grid[randomCell.row][randomCell.col] = newTile;
            this.createTileElement(randomCell.row, randomCell.col, newTile, true, false);
        }
    }
    
    updateDisplay() {
        // 清理已标记为合并的方块
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (this.grid[i][j] && this.grid[i][j].merged) {
                    this.grid[i][j].merged = false;
                }
            }
        }
        
        // 更新分数显示
        this.scoreDisplay.textContent = this.score;
        
        // 更新撤销按钮状态
        this.updateUndoButton();
    }
    
    earnUndoReward() {
        if (this.undoCount < this.maxUndoCount) {
            this.undoCount++;
            this.showUndoReward();
        }
    }
    
    showUndoReward() {
        // 创建一个临时的提示元素显示获得撤销次数
        const reward = document.createElement('div');
        reward.className = 'undo-reward';
        reward.textContent = '+1 撤销';
        document.querySelector('.score-container').appendChild(reward);
        
        // 1秒后移除提示
        setTimeout(() => {
            reward.remove();
        }, 1000);
    }
    
    updateUndoButton() {
        const undoButton = document.querySelector('.btn-undo');
        if (undoButton) {
            // 更新按钮内部content层的文本显示剩余次数
            const contentSpan = undoButton.querySelector('.liquidGlass-content');
            if (contentSpan) {
                contentSpan.textContent = `撤销 (${this.undoCount})`;
            }
            
            // 修复：当历史记录大于1时就应该启用撤销
            if (this.undoCount > 0 && this.stateHistory.length > 1) {
                undoButton.disabled = false;
                undoButton.classList.remove('disabled');
            } else {
                undoButton.disabled = true;
                undoButton.classList.add('disabled');
            }
        }
    }
    
    createTileElement(row, col, tileData, isNew = false, isMerged = false, isReappear = false) {
        const tileWrapper = document.createElement('div');
        tileWrapper.className = `tile liquidGlass-wrapper tile-${tileData.value}`;
        tileWrapper.id = `tile-${tileData.id}`;

        if (isNew) {
            tileWrapper.classList.add('tile-new');
        }
        if (isMerged) {
            tileWrapper.classList.add('tile-merged');
        }
        if (isReappear) {
            tileWrapper.classList.add('tile-reappear');
        }

        // 创建与示例代码一致的内部结构
        const effectDiv = document.createElement('div');
        effectDiv.className = 'liquidGlass-effect';

        const tintDiv = document.createElement('div');
        tintDiv.className = 'liquidGlass-tint';

        const shineDiv = document.createElement('div');
        shineDiv.className = 'liquidGlass-shine';

        const textDiv = document.createElement('div');
        textDiv.className = 'liquidGlass-text';
        textDiv.textContent = tileData.value;

        // 将内部结构添加到包装器中
        tileWrapper.appendChild(effectDiv);
        tileWrapper.appendChild(tintDiv);
        tileWrapper.appendChild(shineDiv);
        tileWrapper.appendChild(textDiv);
        
        const { top, left } = this.getPosition(row, col);
        tileWrapper.style.top = top;
        tileWrapper.style.left = left;
        
        this.tileContainer.appendChild(tileWrapper);
        this.tiles[tileData.id] = tileWrapper; // 引用现在指向包装器
    }
    
    getPosition(row, col) {
        // 检查是否在小屏幕上（响应式）
        const isSmallScreen = window.innerWidth <= 520;
        const gap = isSmallScreen ? 8 : 10; // 响应式间隙
        
        // 计算每个格子的大小
        const cellSize = `(100% - ${gap * 3}px) / 4`;
        
        // 计算位置：格子大小 * 索引 + 间隙 * 索引
        const position = {
            top: `calc(${cellSize} * ${row} + ${gap}px * ${row})`,
            left: `calc(${cellSize} * ${col} + ${gap}px * ${col})`
        };
        
        return position;
    }
    
    checkWin() {
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (this.grid[i][j] && this.grid[i][j].value === 2048) {
                    return true;
                }
            }
        }
        return false;
    }
    
    checkGameOver() {
        // 检查是否还有空格
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (this.grid[i][j] === null) {
                    return false;
                }
            }
        }
        
        // 检查是否还能合并
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const current = this.grid[i][j];
                if (!current) continue;
                
                // 检查右边
                if (j < this.size - 1 && this.grid[i][j + 1] && 
                    current.value === this.grid[i][j + 1].value) {
                    return false;
                }
                // 检查下边
                if (i < this.size - 1 && this.grid[i + 1][j] && 
                    current.value === this.grid[i + 1][j].value) {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    saveState() {
        // 保存当前状态到历史栈
        const state = {
            grid: JSON.parse(JSON.stringify(this.grid)),
            score: this.score,
            undoCount: this.undoCount,
            randomSeed: this.random.getSeed(), // 保存随机种子
            tileId: this.tileId // 保存方块ID计数器
        };
        
        // 检查是否与最后一个状态相同（避免重复保存）
        if (this.stateHistory.length > 0) {
            const lastState = this.stateHistory[this.stateHistory.length - 1];
            // 比较分数作为简单的重复检查（如果分数相同，很可能是重复状态）
            if (lastState.score === state.score && lastState.tileId === state.tileId) {
                return;
            }
        }
        
        this.stateHistory.push(state);
        
        // 限制历史栈大小
        if (this.stateHistory.length > this.maxHistorySize) {
            this.stateHistory.shift();
        }
    }
    
    undo() {
        // 如果正在动画中，忽略撤销
        if (this.isAnimating) return;
        
        // 检查是否有撤销次数和历史记录
        if (this.undoCount > 0 && this.stateHistory.length > 1) {
            // 设置动画标志
            this.isAnimating = true;
            
            // 保存当前游戏状态的快照，用于计算动画
            const currentGridSnapshot = JSON.parse(JSON.stringify(this.grid));
            
            // 移除历史栈最后一个状态（当前状态）
            this.stateHistory.pop();
            
            // 获取要恢复到的状态（上一个状态）
            const previousState = this.stateHistory[this.stateHistory.length - 1];
            
            // 使用快照的grid计算动画，而不是this.grid
            const animations = this.calculateUndoAnimations(currentGridSnapshot, previousState.grid);
            
            // 执行撤销动画
            this.animateUndo(animations, () => {
                // 动画完成后，更新游戏状态
                this.grid = JSON.parse(JSON.stringify(previousState.grid));
                this.score = previousState.score;
                
                // 恢复随机种子和方块ID
                this.random.setSeed(previousState.randomSeed);
                this.tileId = previousState.tileId;
                
                // 减少撤销次数
                this.undoCount--;
                
                // 更新显示
                this.updateDisplay();
                this.updateUndoButton();
                
                // 清除动画标志
                this.isAnimating = false;
            });
        }
    }
    
    calculateUndoAnimations(currentGrid, previousGrid) {
        const animations = {
            movements: [],      // 方块移动
            disappears: [],     // 方块消失（合并后的方块）
            appears: []         // 方块出现（分裂回原来的方块）
        };
        
        // 创建一个映射来追踪方块
        const currentTiles = new Map();
        const previousTiles = new Map();
        
        // 收集当前状态的所有方块
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (currentGrid[i][j]) {
                    currentTiles.set(currentGrid[i][j].id, {
                        tile: currentGrid[i][j],
                        row: i,
                        col: j
                    });
                }
            }
        }
        
        // 收集之前状态的所有方块
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (previousGrid[i][j]) {
                    previousTiles.set(previousGrid[i][j].id, {
                        tile: previousGrid[i][j],
                        row: i,
                        col: j
                    });
                }
            }
        }
        
        // 查找需要移动的方块
        previousTiles.forEach((prevInfo, id) => {
            const currInfo = currentTiles.get(id);
            if (currInfo) {
                // 方块在两个状态都存在，检查是否需要移动
                if (currInfo.row !== prevInfo.row || currInfo.col !== prevInfo.col) {
                    animations.movements.push({
                        tile: prevInfo.tile,
                        from: { row: currInfo.row, col: currInfo.col },
                        to: { row: prevInfo.row, col: prevInfo.col }
                    });
                }
            } else {
                // 方块在当前状态不存在，需要重新出现（被合并的方块）
                animations.appears.push({
                    tile: prevInfo.tile,
                    position: { row: prevInfo.row, col: prevInfo.col }
                });
            }
        });
        
        // 查找需要消失的方块（当前有但之前没有的，如新生成的方块或合并产生的方块）
        currentTiles.forEach((currInfo, id) => {
            if (!previousTiles.has(id)) {
                animations.disappears.push({
                    tile: currInfo.tile,
                    position: { row: currInfo.row, col: currInfo.col }
                });
            }
        });
        
        return animations;
    }
    
    animateUndo(animations, callback) {
        // 首先，让需要消失的方块消失（反向的新方块出现动画）
        animations.disappears.forEach(item => {
            const tile = this.tiles[item.tile.id];
            if (tile) {
                tile.classList.add('tile-disappear');
            }
        });
        
        // 同时移动需要移动的方块
        animations.movements.forEach(movement => {
            const tile = this.tiles[movement.tile.id];
            if (tile) {
                const { top, left } = this.getPosition(movement.to.row, movement.to.col);
                tile.style.top = top;
                tile.style.left = left;
            }
        });
        
        // 150ms后，处理方块的出现和最终状态
        setTimeout(() => {
            // 移除消失的方块
            animations.disappears.forEach(item => {
                const tile = this.tiles[item.tile.id];
                if (tile) {
                    tile.remove();
                    delete this.tiles[item.tile.id];
                }
            });
            
            // 清空所有现有方块并重建（确保状态一致）
            this.tileContainer.innerHTML = '';
            this.tiles = {};
            
            // 从previousGrid重建所有方块
            const previousState = this.stateHistory[this.stateHistory.length - 1];
            for (let i = 0; i < this.size; i++) {
                for (let j = 0; j < this.size; j++) {
                    if (previousState.grid[i][j]) {
                        const wasNewlyAppeared = animations.appears.some(
                            item => item.tile.id === previousState.grid[i][j].id
                        );
                        this.createTileElement(i, j, previousState.grid[i][j], false, false, wasNewlyAppeared);
                    }
                }
            }
            
            // 执行回调
            setTimeout(callback, 50);
        }, 150);
    }
    
    restart() {
        // 清空方块
        this.tileContainer.innerHTML = '';
        this.tiles = {};
        
        this.grid = [];
        this.score = 0;
        this.stateHistory = [];
        this.undoCount = this.initialUndoCount;
        this.tileId = 0;
        
        // 重置随机数生成器
        this.randomSeed = Date.now();
        this.random = this.createSeededRandom(this.randomSeed);
        
        this.hideMessage();
        this.setup();
    }
    
    showMessage(text, className) {
        this.messageContainer.innerHTML = ''; // 先清空内容
        
        const messageText = document.createElement('p');
        messageText.textContent = text;
        this.messageContainer.appendChild(messageText);

        this.messageContainer.className = 'game-message ' + className;
        
        // 当游戏卡住时，显示"撤销"和"再来一局"两个按钮
        if (className === 'game-stuck') {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'message-buttons';
            
            const undoButton = document.createElement('button');
            undoButton.className = 'restart-button';
            undoButton.textContent = `撤销 (${this.undoCount})`;
            undoButton.onclick = () => {
                this.hideMessage();
                this.undo();
            };
            
            const restartButton = document.createElement('button');
            restartButton.className = 'restart-button';
            restartButton.textContent = '再来一局';
            restartButton.onclick = () => game.restart();
            
            buttonContainer.appendChild(undoButton);
            buttonContainer.appendChild(restartButton);
            this.messageContainer.appendChild(buttonContainer);

        } else if (className !== 'game-won' && className !== 'game-over') {
            const restartButton = document.createElement('button');
            restartButton.className = 'restart-button';
            restartButton.textContent = '再来一局';
            restartButton.onclick = () => game.restart();
            this.messageContainer.appendChild(restartButton);
        } else {
             const restartButton = document.createElement('button');
            restartButton.className = 'restart-button';
            restartButton.textContent = '再来一局';
            restartButton.onclick = () => game.restart();
            this.messageContainer.appendChild(restartButton);
        }

        this.messageContainer.style.display = 'flex';
        this.messageContainer.style.alignItems = 'center';
        this.messageContainer.style.justifyContent = 'center';
        this.messageContainer.style.flexDirection = 'column';
    }
    
    hideMessage() {
        this.messageContainer.style.display = 'none';
        this.messageContainer.className = 'game-message';
    }
    
    startLiquidAnimation() {
        // 移除液态动画，因为新的实现不需要动态修改滤镜参数
        // 液态效果现在是静态的，只在背景层显示
    }
    
    // 液态爆发效果 - 用于合并动画
    liquidBurst() {
        const displacementMap = document.querySelector('#liquid-burst feDisplacementMap');
        if (!displacementMap) return;
        
        // 临时增加扭曲强度
        const originalScale = displacementMap.getAttribute('scale');
        displacementMap.setAttribute('scale', '60');
        
        // 300ms后恢复
        setTimeout(() => {
            displacementMap.setAttribute('scale', originalScale);
        }, 300);
    }
    
    // 更新拖动预览效果
    updateDragPreview(offsetX, offsetY) {
        // 计算单个格子的大小
        const cellSize = this.tileContainer.offsetWidth / 4;
        const gap = 10; // 格子间距
        const unitDistance = cellSize + gap;
        
        // 计算预览偏移量，使用缓动系数让动画更流畅
        const dampingFactor = 0.5; // 增加缓动系数，让跟随更灵敏
        const maxOffset = unitDistance * 3.5; // 最大可以移动3.5个格子的距离
        
        // 根据拖动方向限制偏移
        let basePreviewX = 0;
        let basePreviewY = 0;
        
        if (this.dragDirection === 'left' || this.dragDirection === 'right') {
            basePreviewX = Math.max(-maxOffset, Math.min(maxOffset, offsetX * dampingFactor));
            basePreviewY = 0;
        } else if (this.dragDirection === 'up' || this.dragDirection === 'down') {
            basePreviewX = 0;
            basePreviewY = Math.max(-maxOffset, Math.min(maxOffset, offsetY * dampingFactor));
        }
        
        // 批量更新所有砖块的transform
        const transforms = [];
        
        // 应用transform到所有可移动的砖块
        for (let row = 0; row < this.size; row++) {
            for (let col = 0; col < this.size; col++) {
                const tile = this.grid[row][col];
                if (tile && this.tiles[tile.id]) {
                    const element = this.tiles[tile.id];
                    
                    // 检查这个砖块在当前方向上是否可以移动
                    if (this.canTileMove(row, col, this.dragDirection)) {
                        // 添加dragging类
                        if (!element.classList.contains('dragging')) {
                            element.classList.add('dragging');
                        }
                        
                        // 计算渐进的偏移量
                        const progress = Math.min(this.dragDistance / this.minDragDistance, 1);
                        const easedProgress = this.easeOutCubic(progress);
                        
                        // 计算每个砖块可以移动的最大距离
                        let maxMoveDistance = 0;
                        
                        if (this.dragDirection === 'left') {
                            maxMoveDistance = col * unitDistance;
                        } else if (this.dragDirection === 'right') {
                            maxMoveDistance = (this.size - 1 - col) * unitDistance;
                        } else if (this.dragDirection === 'up') {
                            maxMoveDistance = row * unitDistance;
                        } else if (this.dragDirection === 'down') {
                            maxMoveDistance = (this.size - 1 - row) * unitDistance;
                        }
                        
                        // 计算实际偏移量，但不超过砖块可以移动的最大距离
                        const targetOffset = this.dragDirection === 'left' || this.dragDirection === 'right' 
                            ? basePreviewX : basePreviewY;
                        const actualOffset = Math.sign(targetOffset) * 
                            Math.min(Math.abs(targetOffset * easedProgress), maxMoveDistance * 0.9);
                        
                        const actualX = this.dragDirection === 'left' || this.dragDirection === 'right' 
                            ? actualOffset : 0;
                        const actualY = this.dragDirection === 'up' || this.dragDirection === 'down' 
                            ? actualOffset : 0;
                        
                        // 添加轻微的缩放和倾斜效果
                        const scale = 1 + (progress * 0.02);
                        const rotate = this.dragDirection === 'left' ? -1 : 
                                     this.dragDirection === 'right' ? 1 : 
                                     this.dragDirection === 'up' ? -0.5 : 0.5;
                        const rotateAngle = rotate * progress * 2;
                        
                        // 直接设置transform，不使用requestAnimationFrame
                        element.style.transform = `translate(${actualX}px, ${actualY}px) scale(${scale}) rotate(${rotateAngle}deg)`;
                    } else {
                        element.classList.remove('dragging');
                        // 边缘的砖块保持原位
                        element.style.transform = 'translate(0, 0) scale(1) rotate(0deg)';
                    }
                }
            }
        }
    }
    
    // 缓动函数
    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }
    
    // 重置所有砖块的transform
    resetTileTransforms() {
        Object.values(this.tiles).forEach(tile => {
            tile.classList.remove('dragging');
            tile.classList.remove('moving');
            tile.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            tile.style.transform = 'translate(0, 0) scale(1) rotate(0deg)';
        });
    }
    
    // 强制重置所有砖块到正确位置（更彻底的重置）
    forceResetAllTiles() {
        // 遍历网格，确保每个砖块都在正确的位置
        for (let row = 0; row < this.size; row++) {
            for (let col = 0; col < this.size; col++) {
                const gridTile = this.grid[row][col];
                if (gridTile && this.tiles[gridTile.id]) {
                    const tile = this.tiles[gridTile.id];
                    const { top, left } = this.getPosition(row, col);
                    
                    // 移除所有类
                    tile.classList.remove('dragging', 'moving');
                    
                    // 重置样式
                    tile.style.transition = 'none';
                    tile.style.transform = 'translate(0, 0) scale(1) rotate(0deg)';
                    tile.style.top = top;
                    tile.style.left = left;
                    
                    // 强制重绘
                    void tile.offsetHeight;
                    
                    // 恢复transition
                    tile.style.transition = '';
                }
            }
        }
        
        // 移除任何不在网格中的孤立砖块
        Object.keys(this.tiles).forEach(id => {
            let found = false;
            for (let row = 0; row < this.size && !found; row++) {
                for (let col = 0; col < this.size && !found; col++) {
                    if (this.grid[row][col] && this.grid[row][col].id === parseInt(id)) {
                        found = true;
                    }
                }
            }
            if (!found && this.tiles[id]) {
                this.tiles[id].remove();
                delete this.tiles[id];
            }
        });
    }
    
    // 动画滑动到目标位置
    animateTilesToTarget(direction, callback) {
        // 立即设置动画标志，防止重复触发
        this.isAnimating = true;
        
        const movements = [];
        const merges = [];
        
        // 预计算所有砖块的移动路径
        for (let row = 0; row < this.size; row++) {
            for (let col = 0; col < this.size; col++) {
                const tile = this.grid[row][col];
                if (tile && this.tiles[tile.id] && this.canTileMove(row, col, direction)) {
                    const element = this.tiles[tile.id];
                    const movement = this.calculateMovement(row, col, direction);
                    
                    if (movement) {
                        movements.push({
                            element: element,
                            from: { row, col },
                            to: movement.to,
                            distance: movement.distance,
                            willMerge: movement.willMerge
                        });
                    }
                }
            }
        }
        
        // 执行流畅的移动动画
        const cellSize = this.tileContainer.offsetWidth / 4;
        const gap = 10;
        const unitDistance = cellSize + gap;
        
        movements.forEach(move => {
            const element = move.element;
            const distance = move.distance * unitDistance;
            
            let translateX = 0;
            let translateY = 0;
            
            switch (direction) {
                case 'left':
                    translateX = -distance;
                    break;
                case 'right':
                    translateX = distance;
                    break;
                case 'up':
                    translateY = -distance;
                    break;
                case 'down':
                    translateY = distance;
                    break;
            }
            
            // 移除dragging类，使用快速过渡
            element.classList.remove('dragging');
            element.style.transition = 'transform 0.12s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            element.style.transform = `translate(${translateX}px, ${translateY}px)`;
            
            // 如果会合并，添加轻微的缩放效果
            if (move.willMerge) {
                element.style.transform += ' scale(0.95)';
            }
        });
        
        // 在动画完成后执行回调
        setTimeout(() => {
            // 重置所有transform
            this.resetTileTransforms();
            
            // 清除动画标志
            this.isAnimating = false;
            
            // 执行真正的移动逻辑
            if (callback) {
                callback();
            }
        }, 120);
    }
    
    // 计算砖块的移动信息
    calculateMovement(row, col, direction) {
        const tile = this.grid[row][col];
        if (!tile) return null;
        
        let targetRow = row;
        let targetCol = col;
        let distance = 0;
        let willMerge = false;
        
        // 根据方向计算目标位置
        if (direction === 'left') {
            for (let c = col - 1; c >= 0; c--) {
                if (this.grid[row][c] === null) {
                    targetCol = c;
                    distance++;
                } else if (this.grid[row][c].value === tile.value && !this.grid[row][c].merged) {
                    targetCol = c;
                    distance++;
                    willMerge = true;
                    break;
                } else {
                    break;
                }
            }
        } else if (direction === 'right') {
            for (let c = col + 1; c < this.size; c++) {
                if (this.grid[row][c] === null) {
                    targetCol = c;
                    distance++;
                } else if (this.grid[row][c].value === tile.value && !this.grid[row][c].merged) {
                    targetCol = c;
                    distance++;
                    willMerge = true;
                    break;
                } else {
                    break;
                }
            }
        } else if (direction === 'up') {
            for (let r = row - 1; r >= 0; r--) {
                if (this.grid[r][col] === null) {
                    targetRow = r;
                    distance++;
                } else if (this.grid[r][col].value === tile.value && !this.grid[r][col].merged) {
                    targetRow = r;
                    distance++;
                    willMerge = true;
                    break;
                } else {
                    break;
                }
            }
        } else if (direction === 'down') {
            for (let r = row + 1; r < this.size; r++) {
                if (this.grid[r][col] === null) {
                    targetRow = r;
                    distance++;
                } else if (this.grid[r][col].value === tile.value && !this.grid[r][col].merged) {
                    targetRow = r;
                    distance++;
                    willMerge = true;
                    break;
                } else {
                    break;
                }
            }
        }
        
        if (distance > 0) {
            return {
                to: { row: targetRow, col: targetCol },
                distance: distance,
                willMerge: willMerge
            };
        }
        
        return null;
    }
    
    // 检查砖块在指定方向上是否可以移动
    canTileMove(row, col, direction) {
        const tile = this.grid[row][col];
        if (!tile) return false;
        
        // 更简单的逻辑：只要不在移动方向的边缘，就认为可以移动
        // 这样所有理论上可以移动的砖块都会参与拖动预览
        switch (direction) {
            case 'left':
                return col > 0;
            case 'right':
                return col < this.size - 1;
            case 'up':
                return row > 0;
            case 'down':
                return row < this.size - 1;
            default:
                return false;
        }
    }
    
    // 从拖动预览状态过渡到实际移动
    transitionFromDragToMove(direction) {
        // 设置动画标志
        this.isAnimating = true;
        
        // 先确保所有砖块都没有dragging类
        Object.values(this.tiles).forEach(tile => {
            tile.classList.remove('dragging');
        });
        
        // 保存当前所有砖块的transform状态
        const currentTransforms = {};
        Object.keys(this.tiles).forEach(id => {
            const element = this.tiles[id];
            const transform = window.getComputedStyle(element).transform;
            currentTransforms[id] = transform;
        });
        
        // 立即执行游戏逻辑，但暂时不更新显示
        const movements = [];
        const merges = [];
        let moved = false;
        
        // 创建新的网格来存储结果
        const newGrid = [];
        for (let i = 0; i < this.size; i++) {
            newGrid[i] = [];
            for (let j = 0; j < this.size; j++) {
                newGrid[i][j] = null;
            }
        }
        
        // 根据方向处理移动逻辑（复用原有逻辑）
        if (direction === 'left') {
            for (let row = 0; row < this.size; row++) {
                const result = this.processLine(this.getRow(row), row, 0, 0, 1);
                moved = result.moved || moved;
                movements.push(...result.movements);
                merges.push(...result.merges);
                this.setRow(newGrid, row, result.line);
            }
        } else if (direction === 'right') {
            for (let row = 0; row < this.size; row++) {
                const result = this.processLine(this.getRow(row).reverse(), row, 3, 0, -1);
                moved = result.moved || moved;
                movements.push(...result.movements);
                merges.push(...result.merges);
                this.setRow(newGrid, row, result.line.reverse());
            }
        } else if (direction === 'up') {
            for (let col = 0; col < this.size; col++) {
                const result = this.processLine(this.getColumn(col), 0, col, 1, 0);
                moved = result.moved || moved;
                movements.push(...result.movements);
                merges.push(...result.merges);
                this.setColumn(newGrid, col, result.line);
            }
        } else if (direction === 'down') {
            for (let col = 0; col < this.size; col++) {
                const result = this.processLine(this.getColumn(col).reverse(), 3, col, -1, 0);
                moved = result.moved || moved;
                movements.push(...result.movements);
                merges.push(...result.merges);
                this.setColumn(newGrid, col, result.line.reverse());
            }
        }
        
        if (moved) {
            // 更新网格
            this.grid = newGrid;
            
            // 从当前transform状态平滑过渡到最终位置
            this.animateFromCurrentPosition(movements, merges, () => {
                // 动画完成后添加新方块
                this.addNewTile();
                this.saveState();
                this.updateDisplay();
                this.isAnimating = false;
                
                // 游戏状态检查
                if (this.checkWin()) {
                    this.showMessage('你赢了!', 'game-won');
                } else if (this.checkGameOver()) {
                    if (this.undoCount === 0) {
                        this.showMessage('游戏结束', 'game-over');
                    } else {
                        this.showMessage('无路可走!', 'game-stuck');
                    }
                }
            });
        } else {
            // 如果没有移动，确保重置所有砖块的transform
            this.resetTileTransforms();
            // 短暂延迟后清除动画标志，确保重置动画完成
            setTimeout(() => {
                this.isAnimating = false;
            }, 200);
        }
    }
    
    // 从当前位置动画到最终位置
    animateFromCurrentPosition(movements, merges, callback) {
        // 先移除所有砖块的dragging类，添加moving类
        Object.values(this.tiles).forEach(tile => {
            tile.classList.remove('dragging');
            tile.classList.add('moving');
        });
        
        // 计算每个砖块需要移动的距离并应用transform
        const cellSize = this.tileContainer.offsetWidth / 4;
        const gap = 10;
        const unitDistance = cellSize + gap;
        
        // 记录所有需要移动的砖块ID
        const movingTileIds = new Set();
        
        movements.forEach(movement => {
            const tile = this.tiles[movement.tile.id];
            if (tile) {
                movingTileIds.add(movement.tile.id);
                // 计算从原始位置到目标位置的偏移
                const deltaRow = movement.to.row - movement.from.row;
                const deltaCol = movement.to.col - movement.from.col;
                const targetX = deltaCol * unitDistance;
                const targetY = deltaRow * unitDistance;
                
                // 直接设置最终的transform
                tile.style.transform = `translate(${targetX}px, ${targetY}px)`;
            }
        });
        
        // 重置所有未移动的砖块的transform
        Object.entries(this.tiles).forEach(([id, tile]) => {
            if (!movingTileIds.has(id)) {
                tile.style.transform = 'translate(0, 0) scale(1) rotate(0deg)';
                tile.classList.remove('moving');
            }
        });
        
        // 120ms后处理合并和位置更新（与正常动画时间一致）
        setTimeout(() => {
            // 更新所有移动砖块的实际位置
            movements.forEach(movement => {
                const tile = this.tiles[movement.tile.id];
                if (tile) {
                    const { top, left } = this.getPosition(movement.to.row, movement.to.col);
                    // 移除transition临时
                    tile.style.transition = 'none';
                    // 重置transform并设置新位置
                    tile.style.transform = 'translate(0, 0) scale(1) rotate(0deg)';
                    tile.style.top = top;
                    tile.style.left = left;
                    // 强制重绘
                    void tile.offsetHeight;
                    // 恢复transition并移除moving类
                    tile.style.transition = '';
                    tile.classList.remove('moving');
                }
            });
            
            // 处理合并
            merges.forEach(merge => {
                // 移除被合并的方块
                merge.tiles.forEach(tile => {
                    if (this.tiles[tile.id]) {
                        this.tiles[tile.id].remove();
                        delete this.tiles[tile.id];
                    }
                });
                
                // 创建新的合并后的方块
                this.createTileElement(
                    merge.position.row, 
                    merge.position.col, 
                    merge.result,
                    false,
                    true
                );
            });
            
            // 触发液态爆发效果
            if (merges.length > 0) {
                this.liquidBurst();
            }
            
            // 更新分数显示
            this.scoreDisplay.textContent = this.score;
            if (this.score > this.bestScore) {
                this.bestScore = this.score;
                this.bestScoreDisplay.textContent = this.bestScore;
                localStorage.setItem('bestScore', this.bestScore);
            }
            
            // 确保所有砖块的transform都被重置
            setTimeout(() => {
                // 强制重置所有砖块到正确位置
                this.forceResetAllTiles();
                callback();
            }, 30);
        }, 120);
    }
}

// 启动游戏
const game = new Game2048(); 