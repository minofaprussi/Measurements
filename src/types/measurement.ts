export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type MeasurementPoint = {
  id: "start" | "end";
  position: Vec3;
  createdAt: number;
};

export type MeasurementResult = {
  meters: number;
  centimeters: number;
  inches: number;
  feet: number;
};

export type XRSupportState =
  | {
      checked: false;
      supported: false;
      message: "Checking AR support...";
    }
  | {
      checked: true;
      supported: true;
      message: "WebXR AR is supported.";
    }
  | {
      checked: true;
      supported: false;
      message: string;
    };

