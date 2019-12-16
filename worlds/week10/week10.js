"use strict"

/*--------------------------------------------------------------------------------

The proportions below just happen to match the dimensions of my physical space
and the tables in that space.

Note that I measured everything in inches, and then converted to units of meters
(which is what VR requires) by multiplying by 0.0254.

--------------------------------------------------------------------------------*/

/*
NOTE FOR ALL
FINISH:
砖块转起来的反弹有点奇怪 所以我没让他转先
如果大家都在线 砖块可以同时消 但后加入的看到的是最初的
目测这玩意的原理是 像所有client send 东西变更的请求
并不会在server存 TO XTX
TODO：
TO LIN 中间bound 我还没写好 有一丝丝困难 可能逻辑错了
我们多个player 多个手柄 球怎么存 怎么标记还是个问题
TO XTX 看看能不能init 从MR里读（但好像每个client有自己的MR）
或者我们游戏设计成只能三个人同时在线要不然不能玩 或者每次消掉砖块
就update整个bricks to server
TODO：
整个游戏的输赢机制
砖块的排序
特殊砖块（完全没做）
（我严重怀疑这周末都写不完）
*/ 

const inchesToMeters = inches => inches * 0.0254;
const metersToInches = meters => meters / 0.0254;

const EYE_HEIGHT       = inchesToMeters( 69);
const HALL_LENGTH      = inchesToMeters(306);
const HALL_WIDTH       = inchesToMeters(215);
const RING_RADIUS      = 0.0425;
const TABLE_DEPTH      = inchesToMeters( 30);
const TABLE_HEIGHT     = inchesToMeters( 29);
const TABLE_WIDTH      = inchesToMeters( 60);
const TABLE_THICKNESS  = inchesToMeters( 11/8);
const LEG_THICKNESS    = inchesToMeters(  2.5);
const ROOM_SIZE        = 6;
const PLAY_AREA        = 3;
const CUBE_SIZE        = 0.2;
const BALL_SIZE        = 0.02;
const BALL_SPEED       = 3;
const PAD_SIZE         = 0.3;

/* const BOUND1                   = [1, 0, 0];
const BOUND1_reflect_pos_norm  = [1, 0, 0];
const BOUND1_reflect_neg_norm  = [-1, 0, 0];
const BOUND2                   = [-1./2., 0, Math.sqrt(3)/2.];
const BOUND2_reflect_pos_norm  = [-1./2., 0, Math.sqrt(3)/2.];
const BOUND2_reflect_neg_norm  = [1./2., 0, -Math.sqrt(3)/2.];
const BOUND3                   = [-1./2., 0, -Math.sqrt(3)/2.];
const BOUND3_reflect_pos_norm  = [-1./2., 0, -Math.sqrt(3)/2.];
const BOUND3_reflect_neg_norm  = [1./2., 0, Math.sqrt(3)/2.]; */

const BOUDNS_REFLECT_NORM = 
[[1, 0, 0], [-1, 0, 0],
[-1./2., 0, Math.sqrt(3)/2.], [1./2., 0, -Math.sqrt(3)/2.],
[-1./2., 0, -Math.sqrt(3)/2.],[1./2., 0, Math.sqrt(3)/2.]];

const BOUNDS = [[1, 0, 0],[-1./2., 0, Math.sqrt(3)/2.],[-1./2., 0, -Math.sqrt(3)/2.]];

const HALF_SIDE = [[0,0,1],[-Math.sqrt(3)/2.,0,-1/2.],[Math.sqrt(3)/2.,0,-1/2.]];



let enableModeler = true;

/*Example Grabble Object*/
//let grabbableCube = new Obj(CG.torus);

let lathe = CG.createMeshVertices(10, 16, CG.uvToLathe,
             [ CG.bezierToCubic([-1.0,-1.0,-0.7,-0.3,-0.1 , 0.1, 0.3 , 0.7 , 1.0 ,1.0]),
               CG.bezierToCubic([ 0.0, 0.5, 0.8, 1.1, 1.25, 1.4, 1.45, 1.55, 1.7 ,0.0]) ]);
// let lathe = CG.cube;
////////////////////////////// SCENE SPECIFIC CODE

const WOOD = 0,
      TILES = 1,
      NOISY_BUMP = 2;

let noise = new ImprovedNoise();
let m = new Matrix();

/*--------------------------------------------------------------------------------

I wrote the following to create an abstraction on top of the left and right
controllers, so that in the onStartFrame() function we can detect press()
and release() events when the user depresses and releases the trigger.

The field detecting the trigger being pressed is buttons[1].pressed.
You can detect pressing of the other buttons by replacing the index 1
by indices 0 through 5.

You might want to try more advanced things with the controllers.
As we discussed in class, there are many more fields in the Gamepad object,
such as linear and angular velocity and acceleration. Using the browser
based debugging tool, you can do something like console.log(leftController)
to see what the options are.

--------------------------------------------------------------------------------*/

function HeadsetHandler(headset) {
   this.orientation = () => headset.pose.orientation;
   this.position    = () => headset.pose.position;
}

function ControllerHandler(controller) {
   this.isDown      = () => controller.buttons[1].pressed;
   this.onEndFrame  = () => wasDown = this.isDown();
   this.orientation = () => controller.pose.orientation;
   this.position    = () => controller.pose.position;
   this.press       = () => ! wasDown && this.isDown();
   this.release     = () => wasDown && ! this.isDown();
   this.tip         = () => {
      let P = this.position();          // THIS CODE JUST MOVES
      m.identity();                     // THE "HOT SPOT" OF THE
      m.translate(P[0],P[1],P[2]);      // CONTROLLER TOWARD ITS
      m.rotateQ(this.orientation());    // FAR TIP (FURTHER AWAY
      m.translate(0,0,-.03);            // FROM THE USER'S HAND).
      let v = m.value();
      return [v[12],v[13],v[14]];
   }
   this.center = () => {
      let P = this.position();
      m.identity();
      m.translate(P[0],P[1],P[2]);
      m.rotateQ(this.orientation());
      m.translate(0,.02,-.005);
      let v = m.value();
      return [v[12],v[13],v[14]];
   }
   let wasDown = false;
}

// (New Info): constants can be reloaded without worry
// let VERTEX_SIZE = 8;

// (New Info): temp save modules as global "namespaces" upon loads
// let gfx;

// (New Info):
// handle reloading of imports (called in setup() and in onReload())
async function initCommon(state) {
   // (New Info): use the previously loaded module saved in state, use in global scope
   // TODO automatic re-setting of loaded libraries to reduce boilerplate?
   // gfx = state.gfx;
   // state.m = new CG.Matrix();
   // noise = state.noise;
}

// (New Info):
async function onReload(state) {
   // called when this file is reloaded
   // re-initialize imports, objects, and state here as needed
   await initCommon(state);

   // Note: you can also do some run-time scripting here.
   // For example, do some one-time modifications to some objects during
   // a performance, then remove the code before subsequent reloads
   // i.e. like coding in the browser console
}

// (New Info):
async function onExit(state) {
   // called when world is switched
   // de-initialize / close scene-specific resources here
   console.log("Goodbye! =)");
}
let isStart = false;
let threshold = 0.1;
let isInit = false;
let isRestart = false;

async function setup(state) {
   hotReloadFile(getPath('week10.js'));
   // (New Info): Here I am loading the graphics module once
   // This is for the sake of example:
   // I'm making the arbitrary decision not to support
   // reloading for this particular module. Otherwise, you should
   // do the import in the "initCommon" function that is also called
   // in onReload, just like the other import done in initCommon
   // the gfx module is saved to state so I can recover it
   // after a reload
   // state.gfx = await MR.dynamicImport(getPath('lib/graphics.js'));
   state.noise = new ImprovedNoise();
   await initCommon(state);

   // (New Info): input state in a sub-object that can be cached
   // for convenience
   // e.g. const input = state.input; 
   state.input = {
      turnAngle : 0,
      tiltAngle : 0,
      cursor : ScreenCursor.trackCursor(MR.getCanvas()),
      cursorPrev : [0,0,0],
      LC : null,
      RC : null
   }

   // I propose adding a dictionary mapping texture strings to locations, so that drawShapes becomes clearer
   const images = await imgutil.loadImagesPromise([
      getPath("textures/brick1.jpg"),
      getPath("textures/brick2.jpg"),
      getPath("textures/brick3.jpg"),
      getPath("textures/cyber1.jpg"),
   ]);

   let libSources = await MREditor.loadAndRegisterShaderLibrariesForLiveEditing(gl, "libs", [
      { key : "pnoise"    , path : "shaders/noise.glsl"     , foldDefault : true },
      { key : "sharedlib1", path : "shaders/sharedlib1.glsl", foldDefault : true },      
   ]);
   if (! libSources)
      throw new Error("Could not load shader library");

   function onNeedsCompilationDefault(args, libMap, userData) {
      const stages = [args.vertex, args.fragment];
      const output = [args.vertex, args.fragment];
      const implicitNoiseInclude = true;
      if (implicitNoiseInclude) {
         let libCode = MREditor.libMap.get('pnoise');
         for (let i = 0; i < 2; i++) {
               const stageCode = stages[i];
               const hdrEndIdx = stageCode.indexOf(';');
               const hdr = stageCode.substring(0, hdrEndIdx + 1);
               output[i] = hdr + '\n#line 2 1\n' + 
                           '#include<pnoise>\n#line ' + (hdr.split('\n').length + 1) + ' 0' + 
                           stageCode.substring(hdrEndIdx + 1);
         }
      }
      MREditor.preprocessAndCreateShaderProgramFromStringsAndHandleErrors(
         output[0],
         output[1],
         libMap
      );
   }

   // load vertex and fragment shaders from the server, register with the editor
   let shaderSource = await MREditor.loadAndRegisterShaderForLiveEditing(
      gl,
      "mainShader",
      {   
         // (New Info): example of how the pre-compilation function callback
         // could be in the standard library instead if I put the function defintion
         // elsewhere
         onNeedsCompilationDefault : onNeedsCompilationDefault,
         onAfterCompilation : (program) => {
               gl.useProgram(state.program = program);
               state.uColorLoc    = gl.getUniformLocation(program, 'uColor');
               state.uCursorLoc   = gl.getUniformLocation(program, 'uCursor');
               state.uModelLoc    = gl.getUniformLocation(program, 'uModel');
               state.uProjLoc     = gl.getUniformLocation(program, 'uProj');
               state.uTexScale    = gl.getUniformLocation(program, 'uTexScale');
               state.uTexIndexLoc = gl.getUniformLocation(program, 'uTexIndex');
               state.uTimeLoc     = gl.getUniformLocation(program, 'uTime');
               state.uToonLoc     = gl.getUniformLocation(program, 'uToon');
               state.uViewLoc     = gl.getUniformLocation(program, 'uView');
                     state.uTexLoc = [];
                     for (let n = 0 ; n < 8 ; n++) {
                        state.uTexLoc[n] = gl.getUniformLocation(program, 'uTex' + n);
                        gl.uniform1i(state.uTexLoc[n], n);
                     }
         } 
      },
      {
         paths : {
               vertex   : "shaders/vertex.vert.glsl",
               fragment : "shaders/fragment.frag.glsl"
         },
         foldDefault : {
               vertex   : true,
               fragment : false
         }
      }
   );
   if (! shaderSource)
      throw new Error("Could not load shader");

   state.cursor = ScreenCursor.trackCursor(MR.getCanvas());


   state.buffer = gl.createBuffer();
   gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);

   let bpe = Float32Array.BYTES_PER_ELEMENT;

   let aPos = gl.getAttribLocation(state.program, 'aPos');
   gl.enableVertexAttribArray(aPos);
   gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, bpe * VERTEX_SIZE, bpe * 0);

   let aNor = gl.getAttribLocation(state.program, 'aNor');
   gl.enableVertexAttribArray(aNor);
   gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, bpe * VERTEX_SIZE, bpe * 3);

   let aTan = gl.getAttribLocation(state.program, 'aTan');
   gl.enableVertexAttribArray(aTan);
   gl.vertexAttribPointer(aTan, 3, gl.FLOAT, false, bpe * VERTEX_SIZE, bpe * 6);

   let aUV  = gl.getAttribLocation(state.program, 'aUV');
   gl.enableVertexAttribArray(aUV);
   gl.vertexAttribPointer(aUV , 2, gl.FLOAT, false, bpe * VERTEX_SIZE, bpe * 9);


   for (let i = 0 ; i < images.length ; i++) {
      gl.activeTexture (gl.TEXTURE0 + i);
      gl.bindTexture   (gl.TEXTURE_2D, gl.createTexture());
      gl.texParameteri (gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri (gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri (gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
      gl.texParameteri (gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D    (gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[i]);
      gl.generateMipmap(gl.TEXTURE_2D);
   }

   // (New Info): editor state in a sub-object that can be cached
   // for convenience
   // e.g. const editor = state.editor; 
   // state.editor = {
   //     menuShape : [gfx.cube, gfx.sphere, gfx.cylinder, gfx.torus],
   //     objs : [],
   //     menuChoice : -1,
   //     enableModeler : false
   // };

   state.calibrationCount = 0;

   Input.initKeyEvents();

   // load files into a spatial audio context for playback later - the path will be needed to reference this source later
   this.audioContext1 = new SpatialAudioContext([
   'assets/audio/blop.wav'
   ]);

   this.audioContext2 = new SpatialAudioContext([
   'assets/audio/peacock.wav'
   ]);


   /************************************************************************

   Here we show an example of how to create a grabbable object.
   First instatiate object using Obj() constructor, and add the following  
   variables. Then send a spawn message. This will allow the server to keep
   track of objects that need to be synchronized.

   ************************************************************************/
   /*let grabbableCube = new Obj(CG.sphere);
   MR.objs.push(grabbableCube);
   grabbableCube.position    = [0,0,-0.5].slice();
   grabbableCube.orientation = [1,0,0,1].slice();
   grabbableCube.uid = 0;
   grabbableCube.lock = new Lock();
   sendSpawnMessage(grabbableCube);
   console.log("######"+MR.bricks.length);*/
   MR.objs.push(new Obj(CG.sphere));

   if(MR.bricks.length==0){
      let brick = new Brick(1);
      brick.exist = true;
      brick.position = [0,0,-0.5];
      brick.angle = 0;
      brick.uid = -1;
      brick.lock = new Lock();
      //MR.bricks.push(brick); 
      //sendSpawnMessage(brick);
      // 为了方便debug zone 删了方块（们） BY JIN
      console.log("#####Restart!");
      for(let i = 0;i<15;i++){
         for(let j = 0;j<5;j++){
            let brick = new Brick((i+j)%3);
            brick.color
            brick.position = [0,j/2+1,-5+j/2].slice();
            brick.angle = i;
            brick.exist = true;
            brick.uid = i*j+j+1;
            //console.log(brick.uid);
            brick.lock = new Lock();
            //MR.bricks.push(brick);
            //sendSpawnMessage(brick);
         }
      }   
   }
}


/************************************************************************

This is an example of a spawn message we send to the server.

************************************************************************/

function sendSpawnMessage(object){
   const response = 
      {
         type: "spawn",
         uid: object.uid,
         lockid: -1,
         state: {
            position: object.position,
            angle: object.angle,

            
            //orientation: object.orientation,
         }
      };

   MR.syncClient.send(response);
}

function onStartFrame(t, state) {

   /*-----------------------------------------------------------------

   Whenever the user enters VR Mode, create the left and right
   controller handlers.

   Also, for my particular use, I have set up a particular transformation
   so that the virtual room would match my physical room, putting the
   resulting matrix into state.calibrate. If you want to do something
   similar, you would need to do a different calculation based on your
   particular physical room.

   -----------------------------------------------------------------*/

   const input  = state.input;
   const editor = state.editor;

   if (! state.avatarMatrixForward) {
      // MR.avatarMatrixForward is because i need accesss to this in callback.js, temp hack
      MR.avatarMatrixForward = state.avatarMatrixForward = CG.matrixIdentity();
      MR.avatarMatrixInverse = state.avatarMatrixInverse = CG.matrixIdentity();
   } 

   if (MR.VRIsActive()) {
      if (!input.HS) input.HS = new HeadsetHandler(MR.headset);
      if (!input.LC) input.LC = new ControllerHandler(MR.leftController);
      if (!input.RC) input.RC = new ControllerHandler(MR.rightController);

      if (! state.calibrate) {
         m.identity();
         m.rotateY(Math.PI/2);
         //m.translate(-2.01,.04,0); 
         state.calibrate = m.value().slice();
      }
   }

   if (! state.tStart)
      state.tStart = t;
   state.time = (t - state.tStart) / 1000;

    // THIS CURSOR CODE IS ONLY RELEVANT WHEN USING THE BROWSER MOUSE, NOT WHEN IN VR MODE.

   let cursorValue = () => {
      let p = state.cursor.position(), canvas = MR.getCanvas();
      return [ p[0] / canvas.clientWidth * 2 - 1, 1 - p[1] / canvas.clientHeight * 2, p[2] ];
   }

   let cursorXYZ = cursorValue();
   if (state.cursorPrev === undefined)
      state.cursorPrev = [0,0,0];
   if (state.turnAngle === undefined)
      state.turnAngle = state.tiltAngle = 0;
   if (cursorXYZ[2] && state.cursorPrev[2]) {
      state.turnAngle -= Math.PI/2 * (cursorXYZ[0] - state.cursorPrev[0]);
      state.tiltAngle += Math.PI/2 * (cursorXYZ[1] - state.cursorPrev[1]);
   }
   state.cursorPrev = cursorXYZ;

   if (state.position === undefined)
      state.position = [0,0,0];
   let fx = -.01 * Math.sin(state.turnAngle),
       fz =  .01 * Math.cos(state.turnAngle);
   if (Input.keyIsDown(Input.KEY_UP)) {
      state.position[0] += fx;
      state.position[2] += fz;
   }
   if (Input.keyIsDown(Input.KEY_DOWN)) {
      state.position[0] -= fx;
      state.position[2] -= fz;
   }

// SET UNIFORMS AND GRAPHICAL STATE BEFORE DRAWING.

   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
   gl.clearColor(0.0, 0.0, 0.0, 1.0);

   gl.uniform3fv(state.uCursorLoc, cursorXYZ);
   gl.uniform1f (state.uTimeLoc  , state.time);

   gl.enable(gl.DEPTH_TEST);
   gl.enable(gl.CULL_FACE);

   /*-----------------------------------------------------------------

   Below is the logic for my little toy geometric modeler example.
   You should do something more or different for your assignment. 
   Try modifying the size or color or texture of objects. Try
   deleting objects or adding constraints to make objects align
   when you bring them together. Try adding controls to animate
   objects. There are lots of possibilities.

   -----------------------------------------------------------------*/
   if (enableModeler && input.LC) {
      /*if (input.RC.isDown()) {
         menuChoice = findInMenu(input.RC.position(), input.LC.tip());
         if (menuChoice >= 0 && input.LC.press()) {
            state.isNewObj = true;
               let newObject = new Obj(menuShape[menuChoice]);
               /*Should you want to support grabbing, refer to the
               above example in setup()*
            MR.objs.push(newObject);
               sendSpawnMessage(newObject);
         }
      }
      if (state.isNewObj) {
         let obj = MR.objs[MR.objs.length - 1];
         obj.position    = input.LC.tip().slice();
         obj.orientation = input.LC.orientation().slice();
         //Create lock object for each new obj.
         obj.lock = new Lock();
      }
      if (input.LC.release())
         state.isNewObj = false;*/
         if (input.RC.press()){
            isInit = true;
         }
         if(isInit==true && isStart==false && input.RC.release()){
            let obj = MR.objs[0];
            let pos = input.RC.tip().slice();
            obj.position = pos;
            obj.releasePosition = pos;
            obj.orientation = input.RC.orientation().slice();
            m.save();
               m.identity();
               m.rotateQ(input.RC.orientation());
               let t = m.value();
               obj.velocity = vectorMulti(neg(normalize(getOriZ(t))), BALL_SPEED);
            m.restore();
            
            obj.scale = [BALL_SIZE, BALL_SIZE, BALL_SIZE];

            obj.flag = true;    //detect dome
            obj.flag1 = true;   //detect ground
            obj.flag2 = true;   //detect inside boundary
            obj.touch = false;  //detect pad
            obj.color = [1,1,1];

            obj.StartTime = state.time;
            //obj.velocity = RC.Velocity();
            //console.log("objvelocity:", obj.velocity);
            isStart=true;
            isInit=false;
         }

      /*
         New function!!
         press left button to reset the game!
      */
      if (input.LC.press()){
         isRestart = true;
      }

      if(isRestart == true && input.LC.release()){
         MR.objs.splice(0,1);
         isStart = false;
         MR.objs.push(new Obj(CG.sphere));
         isRestart == false;
      }

   }

   if (input.LC) {
      let LP = input.LC.center();
      let RP = input.RC.center();
      let D  = CG.subtract(LP, RP);
      let d  = metersToInches(CG.norm(D));
      let getX = C => {
         m.save();
            m.identity();
            m.rotateQ(CG.matrixFromQuaternion(C.orientation()));
            m.rotateX(.75);
            let x = (m.value())[1];
         m.restore();
         return x;
      }
      let lx = getX(input.LC);
      let rx = getX(input.RC);
      let sep = metersToInches(TABLE_DEPTH - 2 * RING_RADIUS);
      if (d >= sep - 1 && d <= sep + 1 && Math.abs(lx) < .03 && Math.abs(rx) < .03) {
         if (state.calibrationCount === undefined)
            state.calibrationCount = 0;
         if (++state.calibrationCount == 30) {
            m.save();
               m.identity();
               m.translate(CG.mix(LP, RP, .5));
               m.rotateY(Math.atan2(D[0], D[2]) + Math.PI/2);
               //m.translate(-2.35,0-.72); 删了它 校准位置 BY JIN
               state.avatarMatrixForward = CG.matrixInverse(m.value());
               state.avatarMatrixInverse = m.value();
            m.restore();
            state.calibrationCount = 0;
         }
      }
   }

    /*-----------------------------------------------------------------

    This function releases stale locks. Stale locks are locks that
    a user has already lost ownership over by letting go

    -----------------------------------------------------------------*/

    releaseLocks(state);

    /*-----------------------------------------------------------------

    This function checks for intersection and if user has ownership over 
    object then sends a data stream of position and orientation.

    -----------------------------------------------------------------*/

    pollGrab(state);
}

let menuX = [-.2,-.1,-.2,-.1];
let menuY = [ .1, .1,  0,  0];
let menuShape = [ CG.cube, CG.sphere, CG.cylinder, CG.torus ];
let menuChoice = -1;

/*-----------------------------------------------------------------

If the controller tip is near to a menu item, return the index
of that item. If the controller tip is not near to any menu
item, return -1.

mp == position of the menu origin (position of the right controller).
p  == the position of the left controller tip.

-----------------------------------------------------------------*/

let findInMenu = (mp, p) => {
   let x = p[0] - mp[0];
   let y = p[1] - mp[1];
   let z = p[2] - mp[2];
   for (let n = 0 ; n < 4 ; n++) {
      let dx = x - menuX[n];
      let dy = y - menuY[n];
      let dz = z;
      if (dx * dx + dy * dy + dz * dz < .03 * .03)
         return n;
   }
   return -1;
}

function Obj(shape) {
   this.shape = shape;
};

function Brick(color) {
   this.color = color;
};


function onDraw(t, projMat, viewMat, state, eyeIdx) {
   m.identity();
   m.rotateX(state.tiltAngle);
   m.rotateY(state.turnAngle);
   let P = state.position;
   m.translate(P[0],P[1],P[2]);

   m.save();
      myDraw(t, projMat, viewMat, state, eyeIdx, false);
   m.restore();

   m.save();
      m.translate(HALL_WIDTH/2 - TABLE_DEPTH/2, -TABLE_HEIGHT*1.048, TABLE_WIDTH/6.7);
      m.rotateY(Math.PI);
      m.scale(.1392);
      myDraw(t, projMat, viewMat, state, eyeIdx, true);
   m.restore();
}

function myDraw(t, projMat, viewMat, state, eyeIdx, isMiniature) {
   viewMat = CG.matrixMultiply(viewMat, state.avatarMatrixInverse);
   gl.uniformMatrix4fv(state.uViewLoc, false, new Float32Array(viewMat));
   gl.uniformMatrix4fv(state.uProjLoc, false, new Float32Array(projMat));

   let prev_shape = null;

   const input  = state.input;

    /*-----------------------------------------------------------------

    The drawShape() function below is optimized in that it only downloads
    new vertices to the GPU if the vertices (the "shape" argument) have
    changed since the previous call.

    Also, currently we only draw gl.TRIANGLES if this is a cube. In all
    other cases, we draw gl.TRIANGLE_STRIP. You might want to change
    this if you create other kinds of shapes that are not triangle strips.

    -----------------------------------------------------------------*/

   let drawShape = (shape, color, texture, textureScale) => {
      gl.uniform4fv(state.uColorLoc, color.length == 4 ? color : color.concat([1]));
      gl.uniformMatrix4fv(state.uModelLoc, false, m.value());
      gl.uniform1i(state.uTexIndexLoc, texture === undefined ? -1 : texture);
      gl.uniform1f(state.uTexScale, textureScale === undefined ? 1 : textureScale);
      if (shape != prev_shape)
         gl.bufferData(gl.ARRAY_BUFFER, new Float32Array( shape ), gl.STATIC_DRAW);
      if (state.isToon) {
         gl.uniform1f (state.uToonLoc, .3 * CG.norm(m.value().slice(0,3)));
         gl.cullFace(gl.FRONT);
         gl.drawArrays(shape == CG.cube ? gl.TRIANGLES : gl.TRIANGLE_STRIP, 0, shape.length / VERTEX_SIZE);
         gl.cullFace(gl.BACK);
         gl.uniform1f (state.uToonLoc, 0);
      }
      gl.drawArrays(shape == CG.cube ? gl.TRIANGLES : gl.TRIANGLE_STRIP, 0, shape.length / VERTEX_SIZE);
      prev_shape = shape;
   }

   let drawAvatar = (avatar, pos, rot, scale, state) => {
      m.save();
      //   m.identity();
         m.translate(pos[0],pos[1],pos[2]);
         m.rotateQ(rot);
         m.scale(scale,scale,scale);
         drawShape(avatar.headset.vertices, [1,1,1], 0);
      m.restore();
   }

    /*-----------------------------------------------------------------

    In my little toy geometric modeler, the pop-up menu of objects only
    appears while the right controller trigger is pressed. This is just
    an example. Feel free to change things, depending on what you are
    trying to do in your homework.

    -----------------------------------------------------------------*/

   let showMenu = p => {
      let x = p[0], y = p[1], z = p[2];
      for (let n = 0 ; n < 4 ; n++) {
         m.save();
            m.multiply(state.avatarMatrixForward);
            m.translate(x + menuX[n], y + menuY[n], z);
            m.scale(.03, .03, .03);
            drawShape(menuShape[n], n == menuChoice ? [1,.5,.5] : [1,1,1]);
         m.restore();
      }
   }

    /*-----------------------------------------------------------------

    drawTable() just happens to model the physical size and shape of the
    tables in my lab (measured in meters). If you want to model physical
    furniture, you will probably want to do something different.

    -----------------------------------------------------------------*/

   let drawTable = id => {
      m.save();
         m.translate(0, TABLE_HEIGHT - TABLE_THICKNESS/2, 0);
         m.scale(TABLE_DEPTH/2, TABLE_THICKNESS/2, TABLE_WIDTH/2);
         drawShape(CG.cube, [1,1,1], 0);
      m.restore();
      m.save();
         let h  = (TABLE_HEIGHT - TABLE_THICKNESS) / 2;
         let dx = (TABLE_DEPTH  - LEG_THICKNESS  ) / 2;
         let dz = (TABLE_WIDTH  - LEG_THICKNESS  ) / 2;
         for (let x = -dx ; x <= dx ; x += 2 * dx)
         for (let z = -dz ; z <= dz ; z += 2 * dz) {
            m.save();
               m.translate(x, h, z);
               m.scale(LEG_THICKNESS/2, h, LEG_THICKNESS/2);
               drawShape(CG.cube, [.5,.5,.5]);
            m.restore();
         }
      m.restore();
   }

    /*-----------------------------------------------------------------

    The below is just my particular "programmer art" for the size and
    shape of a controller. Feel free to create a different appearance
    for the controller. You might also want the controller appearance,
    as well as the way it animates when you press the trigger or other
    buttons, to change with different functionality.

    For example, you might want to have one appearance when using it as
    a selection tool, a resizing tool, a tool for drawing in the air,
    and so forth.

    -----------------------------------------------------------------*/
    
   let drawHeadset = (position, orientation) => {
      //  let P = HS.position();'
      let P = position;

      m.save();
         m.multiply(state.avatarMatrixForward);
         m.translate(P[0],P[1],P[2]);
         m.rotateQ(orientation);
         m.scale(.1);
         m.save();
            m.scale(1,1.5,1);
            drawShape(CG.sphere, [0,0,0]);
         m.restore();
         for (let s = -1 ; s <= 1 ; s += 2) {
            m.save();
               m.translate(s*.4,.2,-.8);
               m.scale(.4,.4,.1);
               drawShape(CG.sphere, [10,10,10]);
            m.restore();
         }
      m.restore();
   }

   let drawController = (C, hand, color) => {
      let P = C.position(), s = C.isDown() ? .0125 : .0225;
      m.save();
         m.multiply(state.avatarMatrixForward);
         m.translate(P[0], P[1], P[2]);
         m.rotateQ(C.orientation());
           m.save();
              m.translate(0,0,0.01);
              m.scale(PAD_SIZE,PAD_SIZE,0.005);
              drawShape(CG.cylinder, color);
           m.restore();
           m.save();
              m.translate(0,0,.025);
              m.scale(.015,.015,.01);
              drawShape(CG.cube, [0,0,0]);
           m.restore();
           m.save();
              m.translate(0,0,.035);
              m.rotateX(.5);
                 m.save();
                    m.translate(0,-.001,.035);
                    m.scale(.014,.014,.042);
                    drawShape(CG.cylinder, [0,0,0]);
                 m.restore();
                 m.save();
                    m.translate(0,-.001,.077);
                    m.scale(.014,.014,.014);
                    drawShape(CG.sphere, [0,0,0]);
                 m.restore();
           m.restore();
      m.restore();
   }


   let drawSyncController = (pos, rot, color) => {
      let P = pos;
      m.save();
         m.translate(P[0], P[1], P[2]);
         m.rotateQ(rot);
           m.save();
              m.translate(0,0,0.01);
              m.scale(PAD_SIZE,PAD_SIZE,0.005);
              drawShape(CG.cylinder, color);
           m.restore();
           m.save();
              m.translate(0,0,.025);
              m.scale(.015,.015,.01);
              drawShape(CG.cube, [0,0,0]);
           m.restore();
           m.save();
              m.translate(0,0,.035);
              m.rotateX(.5);
                 m.save();
                    m.translate(0,-.001,.035);
                    m.scale(.014,.014,.042);
                    drawShape(CG.cylinder, [0,0,0]);
                 m.restore();
                 m.save();
                    m.translate(0,-.001,.077);
                    m.scale(.014,.014,.014);
                    drawShape(CG.sphere, [0,0,0]);
                 m.restore();
           m.restore();
      m.restore();
   }

   if (input.LC) {
      if (isMiniature)
         drawHeadset(input.HS.position(), input.HS.orientation());
      m.save();

      let P = state.position;
      m.translate(-P[0],-P[1],-P[2]);
      m.rotateY(-state.turnAngle);
      m.rotateX(-state.tiltAngle);

      drawController(input.LC, 0,[1,0,0]);
      drawController(input.RC, 1, [0,0,1]);
      if (enableModeler && input.RC.isDown())
         //showMenu(input.RC.position());
      m.restore();
   }

   let isTouch = (ball, C) => {
      let ballPos = ball.position;
      let conPos = C.position();
      let dz = Math.abs(ballPos[2]-conPos[2]);
      if (dz>threshold){
         return false;
      }
      else{
         let dx = ballPos[0]-conPos[0];
         let dy = ballPos[1]-conPos[1];
         if (dx*dx+dy*dy>PAD_SIZE*PAD_SIZE){
            return false;
         }
         else{
            return true;
         }
      }

   }

   let hitBrick = (ballPos)=>{
      for(let i = 0;i<MR.bricks.length;i++){
         if(MR.bricks[i].exist){
            let b_x = Math.sin((MR.bricks[i].angle)/2)*MR.bricks[i].position[2];
            let b_y = MR.bricks[i].position[1];
            let b_z = Math.cos((MR.bricks[i].angle)/2)*MR.bricks[i].position[2];
            let x = ballPos[0]-b_x;
            let y = ballPos[1]-b_y;
            let z = ballPos[2]-b_z;
            if(Math.abs(x)<=CUBE_SIZE&& Math.abs(y)<=CUBE_SIZE&& Math.abs(z)<=CUBE_SIZE){
               let maxVal = Math.max(Math.abs(x),Math.max(Math.abs(y),Math.abs(z)));
               let norm = [];
               if(maxVal == x){
                  norm = normalize([-b_z,0,b_x]);
               }else if(maxVal == -x){
                  norm = normalize([b_z,0,-b_x]);
               }else if(maxVal == y){
                  norm = [0,1,0];
               }else if(maxVal == -y){
                  norm = [0,-1,0];
               }else if(maxVal == z){
                  norm = normalize([-b_x,0,-b_z]);
               }else if(maxVal == -z){
                  norm = normalize([b_x,0,b_z]);
               }             
               return [i,norm];
            }
         }  
      }
      return [-1,[]];
   }

   /*我把你的code搞在了一起 你看看你手柄反弹能不能也用这个
      To LIN
      Lin: FIXED. DEC 14  22:01
   */

   /* let checkDis = (p, bound) =>{
      return Math.abs(dot(p,bound));
   } */

   let disThreshold = 0.08;

   let isHalfSide = (p, index) => {
      let temp = dot(p, HALF_SIDE[index]);
      return temp < 0;
   }

   let changeVelocity = (ball,N)=>{
      let v = norm(ball.velocity);
      let I = normalize(neg(ball.velocity));
      let w = 2.*dot(I, N);
      ball.StartTime=state.time;
      ball.releasePosition = ball.position.slice();
      ball.velocity = [v*(w*N[0]-I[0]), v*(w*N[1]-I[1]), v*(w*N[2]-I[2])];
   }

   /*TO LIN: still wrong plz fix it 
   LIN: FIXED. DEC 15  10:36
   */
   let checkInsideBound = (position)=>{
      let P = position;
      for (let i = 0; i<3;i++){
         let temp = dot(P , BOUNDS[i]);
         if (Math.abs(temp) < disThreshold && isHalfSide(P, i)){
            if (temp>0) return 2*i;
            else return 2*i+1;
         }
      }
      return -1;
   }


   if (isStart == false&& input.LC){
      let ball = MR.objs[0];
      let P = input.RC.position();
      m.save();
          m.identity();
          m.translate(P[0], P[1], P[2]);
          m.rotateQ(input.RC.orientation());
          m.translate(0,0,-.03);
          m.translate(0,0,0.025);
          m.scale(BALL_SIZE, BALL_SIZE, BALL_SIZE);
          drawShape(ball.shape, [1,1,1]);
      m.restore();
      
   }
   else if(isStart){
      for (let n = 0 ; n < MR.objs.length ; n++) {
         let ball = MR.objs[n], P = ball.position.slice(), RP = ball.releasePosition.slice();
         //console.log(ball.position); 
         P[1] = P[1]+EYE_HEIGHT; //矫正位置 希望多人也对 
         // TO LIN 有个问题 在特殊的不知道啥情况的case好像矫正位置之后球会飞出去 很惨 随机bug超难搞
         m.save();
           if (ball.velocity){
              //console.log(ball.velocity);
           // update ball position with time and velocity
              m.translate(RP[0], RP[1], RP[2]);
              let time = state.time - ball.StartTime;
              ball.position = [RP[0]+ball.velocity[0] * time, RP[1]+ball.velocity[1] * time, RP[2]+ball.velocity[2] * time];
              m.translate(ball.velocity[0] * time, ball.velocity[1] * time, ball.velocity[2] * time);
  
              // if the ball hits the boundary of the sphere scene
              if (norm(P)> ROOM_SIZE-BALL_SIZE ){
                  if(ball.flag){
                     //console.log(ball.velocity);
                     console.log("bounding")
                     /*let N = normalize(neg(ball.position));
                     let v = norm(ball.velocity);
                     let I = normalize(neg(ball.velocity));
                     let w = 2.*dot(I, N);
                     ball.StartTime=state.time;
                     ball.releasePosition = ball.position.slice();
                     ball.velocity = [v*(w*N[0]-I[0]), v*(w*N[1]-I[1]), v*(w*N[2]-I[2])];
                     ball.flag = false;*/
                     changeVelocity(ball,normalize(neg(ball.position)));
                     ball.flag = false;
                  }else{
                     console.log(ball.velocity);
                  }
              }
              else if (norm(P)<ROOM_SIZE-0.01){
                 ball.flag = true;
              }
              //地面快乐反弹 貌似好了 BY JIN
              if(P[1] <BALL_SIZE/2 &&ball.flag1){
                  ball.flag1 = false;
                 console.log(P[1]);
                 console.log("size Change");                
                 changeVelocity(ball,[0,1,0]);
              }else if(P[1] >=BALL_SIZE/2&&!ball.flag1){
                 console.log("change flag1")
                 ball.flag1 = true;
              }
              /*still have error to fixED to LIN
              LIN: FIXED. DEC 15  00:19
              */
              let insideBound = checkInsideBound(ball.position);
              if(insideBound!=-1 && ball.flag2){
                     changeVelocity(ball, BOUDNS_REFLECT_NORM[insideBound]);
                     ball.flag2 = false;
               }else if(!ball.flag2&&insideBound==-1){
                     ball.flag2 = true;
               }
  
              // if the ball hits the pad
              if (ball.touch && isTouch(ball, input.RC)){
                 let N;
                 m.save();
                    m.identity();
                    m.rotateQ(input.RC.orientation());
                    let t = m.value();
                    N = neg(normalize(getOriZ(t)));
                 m.restore();
                 changeVelocity(ball,N);
                 ball.touch = false;
              }
              else if(Math.abs(ball.position[2]-input.RC.position()[2])>threshold){
                 ball.touch = true;
              }
  
              // if the ball hits the bricks
              let brickP = hitBrick(ball.position);         
              if(brickP[0]!=-1){     
                 //console.log("hit "+brickP[0]+" at "+ball.position);
                 changeVelocity(ball,brickP[1]);
                  const response = 
                     {
                        type: "brick",
                        uid: MR.bricks[brickP[0]].uid,
                        state: {action:"delete",
                                 index: brickP[0]},
                     };
               
                 MR.syncClient.send(response);
                 MR.bricks[brickP[0]].exist = false;
                 //MR.bricks.splice(brickP[0],1);
              }
           }
           
           else {
              m.translate(P[0], P[1], P[2]);
           }
       
           //draw the ball
            m.rotateQ(ball.orientation);
            m.scale(...ball.scale);
            drawShape(ball.shape, ball.color);
         m.restore();
      }
     }

    /*-----------------------------------------------------------------

    This is where I draw the objects that have been created.

    If I were to make these objects interactive (that is, responsive
    to the user doing things with the controllers), that logic would
    need to go into onStartFrame(), not here.

    -----------------------------------------------------------------*/
   let drawCube = (m,color) =>{
      m.save();
         m.scale(CUBE_SIZE,CUBE_SIZE,CUBE_SIZE);
         drawShape(CG.cube,[3,3,3],color,1);
      m.restore();
    }
    for( let n  = 0; n < MR.bricks.length ; n++){
       if(MR.bricks[n].exist){
         let pos = MR.bricks[n].position;
         m.save();
            m.rotateY((MR.bricks[n].angle)/2);
            m.translate(pos[0],pos[1],pos[2]);
            drawCube(m,MR.bricks[n].color);
         m.restore();
       }
      }
   /*for (let n = 0 ; n < MR.objs.length ; n++) {
      let obj = MR.objs[n], P = obj.position;
      m.save();
         m.multiply(state.avatarMatrixForward);
         m.translate(P[0], P[1], P[2]);
         m.rotateQ(obj.orientation);
         m.scale(.03,.03,.03);
         drawShape(obj.shape, [1,1,1]);
         
      m.restore();
   }*/

   m.translate(0, -EYE_HEIGHT, 0);
 
    /*-----------------------------------------------------------------

    Notice that I make the room itself as an inside-out cube, by
    scaling x,y and z by negative amounts. This negative scaling
    is a useful general trick for creating interiors.

    -----------------------------------------------------------------*/

   m.save();
      //let dy = isMiniature ? 0 : HALL_WIDTH/2;
      //m.translate(0, dy, 0);
      //m.scale(-HALL_WIDTH/2, -dy, -HALL_LENGTH/2);
      //drawShape(CG.cube, [1,1,1], 1,4, 2,4);
      m.rotateX(Math.PI*0.5);
      m.scale(-ROOM_SIZE,-ROOM_SIZE,-ROOM_SIZE);
      drawShape(CG.sphere, [1,1,1],3);
   m.restore();
   m.save();
      m.rotateX(Math.PI*0.5);
      m.scale(PLAY_AREA/2, PLAY_AREA/2, 0.01);
      drawShape(CG.cylinder, [1,1,1],1);
   m.restore();


   /*m.save();
      m.translate((HALL_WIDTH - TABLE_DEPTH) / 2, 0, 0);
      drawTable(0);
   m.restore();

   m.save();
      m.translate((TABLE_DEPTH - HALL_WIDTH) / 2, 0, 0);
      drawTable(1);
   m.restore();*/

   // DRAW TEST SHAPE

   m.save();
      m.translate(0, 2 * TABLE_HEIGHT, (TABLE_DEPTH - HALL_WIDTH) / 2);
      //m.aimZ([Math.cos(state.time),Math.sin(state.time),0]);
      m.rotateY(state.time);
      m.scale(.06,.06,.6);
      //drawShape(lathe, [1,.2,0]);
      m.restore();

      let A = [0,0,0];
      let B = [1+.4*Math.sin(2 * state.time),.4*Math.cos(2 * state.time),0];
      let C = CG.ik(.7,.7,B,[0,-1,-2]);

      m.save();
      m.translate(-.5, 2.5 * TABLE_HEIGHT, (TABLE_DEPTH - HALL_WIDTH) / 2);
      //m.rotateY(state.time);
      /*
      m.save();
         m.translate(A[0],A[1],A[2]).scale(.07);
         drawShape(CG.sphere, [1,1,1]);
      m.restore();

      m.save();
         m.translate(B[0],B[1],B[2]).scale(.07);
         drawShape(CG.sphere, [1,1,1]);
      m.restore();

      m.save();
         m.translate(C[0],C[1],C[2]).scale(.07);
         drawShape(CG.sphere, [1,1,1]);
      m.restore();
      */
      state.isToon = true;
      let skinColor = [1,.5,.3], D;
      m.save();
         D = CG.mix(A,C,.5);
         m.translate(D[0],D[1],D[2]);
         m.aimZ(CG.subtract(A,C));
         m.scale(.05,.05,.37);
         //drawShape(lathe, skinColor, -1,1, 2,1);
      m.restore();

      m.save();
         D = CG.mix(C,B,.5);
         m.translate(D[0],D[1],D[2]).aimZ(CG.subtract(C,B)).scale(.03,.03,.37);
         //drawShape(lathe, skinColor, -1,1, 2,1);
      m.restore();
      state.isToon = false;

   m.restore();
      /*-----------------------------------------------------------------
        Here is where we draw avatars and controllers.
      -----------------------------------------------------------------*/
   
   for (let id in MR.avatars) {
      
      const avatar = MR.avatars[id];

      if (avatar.mode == MR.UserType.vr) {
         if (MR.playerid == avatar.playerid)
            continue;
         
         let headsetPos = avatar.headset.position;
         let headsetRot = avatar.headset.orientation;

         if(headsetPos == null || headsetRot == null)
            continue;

         if (typeof headsetPos == 'undefined') {
            console.log(id);
            console.log("not defined");
         }
         
         const rcontroller = avatar.rightController;
         const lcontroller = avatar.leftController;
         
         let hpos = headsetPos.slice();
         hpos[1] += EYE_HEIGHT;

         drawHeadset(hpos, headsetRot);
         let lpos = lcontroller.position.slice();
         lpos[1] += EYE_HEIGHT;
         let rpos = rcontroller.position.slice();
         rpos[1] += EYE_HEIGHT;

         drawSyncController(rpos, rcontroller.orientation, [1,0,0]);
         drawSyncController(lpos, lcontroller.orientation, [0,1,1]);
      }
   }
}

function onEndFrame(t, state) {
   pollAvatarData();

   /*-----------------------------------------------------------------

   The below two lines are necessary for making the controller handler
   logic work properly -- in particular, detecting press() and release()
   actions.

   -----------------------------------------------------------------*/

   const input  = state.input;

   if (input.HS != null) {

      // Here is an example of updating each audio context with the most
      // recent headset position - otherwise it will not be spatialized

      this.audioContext1.updateListener(input.HS.position(), input.HS.orientation());
      this.audioContext2.updateListener(input.HS.position(), input.HS.orientation());
   
      // Here you initiate the 360 spatial audio playback from a given position,
      // in this case controller position, this can be anything,
      // i.e. a speaker, or an drum in the room.
      // You must provide the path given, when you construct the audio context.

      if (input.LC && input.LC.press())
         this.audioContext1.playFileAt('assets/audio/blop.wav', input.LC.position());

      if (input.RC && input.RC.press())
         this.audioContext2.playFileAt('assets/audio/peacock.wav', input.RC.position());
   }

   if (input.LC) input.LC.onEndFrame();
   if (input.RC) input.RC.onEndFrame();
}

export default function main() {
   const def = {
      name: 'YOUR_NAME_HERE week10',
      setup: setup,
      onStartFrame: onStartFrame,
      onEndFrame: onEndFrame,
      onDraw: onDraw,

      // (New Info): New callbacks:

      // VR-specific drawing callback
      // e.g. for when the UI must be different 
      //      in VR than on desktop
      //      currently setting to the same callback as on desktop
      onDrawXR: onDraw,
      // call upon reload
      onReload: onReload,
      // call upon world exit
      onExit: onExit
   };

   return def;
}


//////////////EXTRA TOOLS

// A better approach for this would be to define a unit sphere and
// apply the proper transform w.r.t. corresponding grabbable object

function checkIntersection(point, verts) {
   const bb = calcBoundingBox(verts);
   const min = bb[0];
   const max = bb[1];

   if (point[0] > min[0] && point[0] < max[0] &&
      point[1] > min[1] && point[1] < max[1] &&
      point[2] > min[2] && point[2] < max[2]) return true;

   return false;
}

// see above

function calcBoundingBox(verts) {
   const min = [Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE];
   const max = [Number.MIN_VALUE,Number.MIN_VALUE,Number.MIN_VALUE];
    
   for(let i = 0; i < verts.length; i+=2){

      if(verts[i] < min[0]) min[0] = verts[i];
      if(verts[i+1] < min[1]) min[1] = verts[i+1];
      if(verts[i+2] < min[2]) min[2] = verts[i+2];

      if(verts[i] > max[0]) max[0] = verts[i];
      if(verts[i+1] > max[1]) max[1] = verts[i+1];
      if(verts[i+2] > max[2]) max[2] = verts[i+2];
   }

   return [min, max];
}

function pollGrab(state) {
   let input = state.input;
   if ((input.LC && input.LC.isDown()) || (input.RC && input.RC.isDown())) {

      let controller = input.LC.isDown() ? input.LC : input.RC;
      for (let i = 0; i < MR.objs.length; i++) {
         //ALEX: Check if grabbable.
         let isGrabbed = checkIntersection(controller.position(), MR.objs[i].shape);
         //requestLock(MR.objs[i].uid);
         /*if (isGrabbed == true) {
            if (MR.objs[i].lock.locked) {
               MR.objs[i].position = controller.position();
               const response =
               {
                  type: "object",
                  uid: MR.objs[i].uid,
                  state: {
                     position: MR.objs[i].position,
                     orientation: MR.objs[i].orientation,
                  },
                  lockid: MR.playerid,

               };

               MR.syncClient.send(response);
            } else {
               MR.objs[i].lock.request(MR.objs[i].uid);
            }
         }*/
      }
   }
}

function releaseLocks(state) {
   let input = state.input;
   if ((input.LC && !input.LC.isDown()) && (input.RC && !input.RC.isDown())) {
      for (let i = 0; i < MR.objs.length; i++) {
         /*if (MR.objs[i].lock.locked == true) {
            MR.objs[i].lock.locked = false;
            MR.objs[i].lock.release(MR.objs[i].uid);
         }*/
      }
   }
}
