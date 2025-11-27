export interface Point {
  x: number;
  y: number;
}

export enum GameState {
  LOADING = 'LOADING',
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
}

// MediaPipe Types (Simplified for global usage)
export interface WindowWithMediaPipe extends Window {
  Hands: any;
  Camera: any;
  drawConnectors: any;
  drawLandmarks: any;
  HAND_CONNECTIONS: any;
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface MediaPipeResults {
  image: CanvasImageSource;
  multiHandLandmarks: HandLandmark[][];
  multiHandedness: any[];
}
