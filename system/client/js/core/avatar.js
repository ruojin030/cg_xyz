'use strict';
const BALL_SIZE = 0.1;
class Avatar {
    constructor(head, id, leftController, rightController){
        this.playerid = id;
        this.headset = head;
        this.leftController = leftController;
        this.rightController = rightController;
        //TODO: Do we really want this to be the default?
        this.mode = MR.UserType.browser;
    }
}
const colors = [[5,0,0],[0.8784*5, 0.498*5, 0.0588*5],[0,0,5]];
class Ball {
  constructor(id) {
    this.id = id;
    this.position = [0,0,0];
    this.orientation = [0,0,0,0];
    this.releasePosition = [0,0,0];
    this.color = colors[id];
    this.shape = CG.sphere;
    this.scale = [BALL_SIZE, BALL_SIZE, BALL_SIZE];
    this.flag = true;
    this.flag1 = true; // 更多flag 更多精彩
    this.flag2 = true;
    this.touch = false;
    this.velocity = [0,0,0];
    this.StartTime = 0;
  }
    restore(){
    this.position = [0,0,0];
    this.orientation = [0,0,0,0];
    this.releasePosition = [0,0,0];
    this.color = colors[this.id];
    this.shape = CG.sphere;
    this.scale = [BALL_SIZE, BALL_SIZE, BALL_SIZE];
    this.flag = true;
    this.flag1 = true; // 更多flag 更多精彩
    this.flag2 = true;
    this.touch = false;
    this.velocity = [0,0,0];
    this.StartTime = 0;
  }
}

class Headset {
    constructor(verts) {
        this.vertices = verts;
        this.position = [0,0,0];
        this.orientation = [0,0,0,0];
    }
}

class Controller {
  constructor(verts) {
    this.vertices = verts;
    this.position = [0,0,0];
    this.orientation = [0,0,0,0];
    this.analog = new Button();
    this.trigger = new Button();
    this.side = new Button();
    this.x = new Button();
    this.y = new Button();
  }
}

class Button {
     //buttons have a 'pressed' variable that is a boolean.
        /*A quick mapping of the buttons:
          0: analog stick
          1: trigger
          2: side trigger
          3: x button
          4: y button
          5: home button
        */
    constructor(){
        this.pressed = false;
    }
}
