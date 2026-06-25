export interface ArrRelease {
  guid: string;
  indexerId: number;
  title: string;
  protocol: string;
  approved: boolean;
  customFormatScore: number;
  qualityWeight: number;
  seeders?: number;
  age: number;
  quality: {
    quality: {
      id: number;
      name: string;
      source: string;
      resolution: number;
    };
  };
}
