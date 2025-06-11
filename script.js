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
        
        this.setup();
        this.updateDisplay();
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
                if ([37, 38, 39, 40].indexOf(e.keyCode) > -1) {
                    e.preventDefault();
                    switch(e.keyCode) {
                        case 37: this.move('left'); break;
                        case 38: this.move('up'); break;
                        case 39: this.move('right'); break;
                        case 40: this.move('down'); break;
                    }
                }
            };
        }
        
        // 移除可能存在的旧监听器，然后添加新的
        document.removeEventListener('keydown', this.keydownHandler);
        document.addEventListener('keydown', this.keydownHandler);
        
        // 触摸事件
        const gameContainer = document.querySelector('.game-container');
        
        gameContainer.addEventListener('touchstart', (e) => {
            this.startX = e.touches[0].clientX;
            this.startY = e.touches[0].clientY;
        }, { passive: false });
        
        gameContainer.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
        
        gameContainer.addEventListener('touchend', (e) => {
            this.endX = e.changedTouches[0].clientX;
            this.endY = e.changedTouches[0].clientY;
            this.handleSwipe();
        }, { passive: false });
        
        // 鼠标滑动支持（用于桌面端测试）
        let mouseDown = false;
        gameContainer.addEventListener('mousedown', (e) => {
            mouseDown = true;
            this.startX = e.clientX;
            this.startY = e.clientY;
        });
        
        gameContainer.addEventListener('mouseup', (e) => {
            if (mouseDown) {
                this.endX = e.clientX;
                this.endY = e.clientY;
                this.handleSwipe();
                mouseDown = false;
            }
        });
    }
    
    handleSwipe() {
        const diffX = this.endX - this.startX;
        const diffY = this.endY - this.startY;
        const minSwipeDistance = 50;
        
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
        // 如果正在动画中，忽略移动
        if (this.isAnimating) return;
        
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
                this.updateDisplay();
                
                // 保存移动后的完整状态（包含新方块）
                this.saveState();
                
                // 清除动画标志
                this.isAnimating = false;
                
                if (this.checkWin()) {
                    this.showMessage('你赢了！', 'game-won');
                } else if (this.checkGameOver()) {
                    this.showMessage('游戏结束', 'game-over');
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
        
        // 150ms后处理合并
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
            
            // 更新分数显示
            this.scoreDisplay.textContent = this.score;
            if (this.score > this.bestScore) {
                this.bestScore = this.score;
                this.bestScoreDisplay.textContent = this.bestScore;
                localStorage.setItem('bestScore', this.bestScore);
            }
            
            // 再等待一小段时间后执行回调
            setTimeout(callback, 50);
        }, 150);
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
            // 更新按钮文本显示剩余次数
            undoButton.textContent = `撤销 (${this.undoCount})`;
            
            // 如果没有撤销次数或没有历史记录，禁用按钮
            if (this.undoCount === 0 || this.stateHistory.length <= 1) {
                undoButton.disabled = true;
                undoButton.classList.add('disabled');
            } else {
                undoButton.disabled = false;
                undoButton.classList.remove('disabled');
            }
        }
    }
    
    createTileElement(row, col, tileData, isNew = false, isMerged = false, isReappear = false) {
        const tile = document.createElement('div');
        tile.className = `tile tile-${tileData.value}`;
        if (isNew) {
            tile.classList.add('tile-new');
        }
        if (isMerged) {
            tile.classList.add('tile-merged');
        }
        if (isReappear) {
            tile.classList.add('tile-reappear');
        }
        tile.textContent = tileData.value;
        
        const { top, left } = this.getPosition(row, col);
        tile.style.top = top;
        tile.style.left = left;
        
        this.tileContainer.appendChild(tile);
        this.tiles[tileData.id] = tile;
    }
    
    getPosition(row, col) {
        // 检查是否在小屏幕上（响应式）
        const isSmallScreen = window.innerWidth <= 520;
        const gap = isSmallScreen ? 8 : 10; // 响应式间隙
        const totalGaps = gap * 3; // 3个间隙
        
        // 使用CSS calc来计算位置
        const position = {
            top: `calc(${row} * ((100% - ${totalGaps}px) / 4 + ${gap}px))`,
            left: `calc(${col} * ((100% - ${totalGaps}px) / 4 + ${gap}px))`
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
        this.messageContainer.querySelector('p').textContent = text;
        this.messageContainer.className = 'game-message ' + className;
        this.messageContainer.style.display = 'flex';
        this.messageContainer.style.alignItems = 'center';
        this.messageContainer.style.justifyContent = 'center';
        this.messageContainer.style.flexDirection = 'column';
    }
    
    hideMessage() {
        this.messageContainer.style.display = 'none';
        this.messageContainer.className = 'game-message';
    }
}

// 启动游戏
const game = new Game2048(); 