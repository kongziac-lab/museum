/**
 * Core domain types for the digital exhibition engine.
 * Kept framework-agnostic so they can be shared between the 3D runtime,
 * the layout editor, and the backend/API layer.
 */

/** A tuple representing a 3D coordinate or Euler rotation. */
export type Vec3 = [number, number, number];

/**
 * A raw image discovered on disk by the auto-import system.
 * Dimensions are resolved at runtime from the decoded texture.
 */
export interface ArtworkSource {
  /** Stable id derived from the file path, e.g. "main/583123551_...". */
  id: string;
  /** Public URL used as the texture source, e.g. "/artworks/main/foo.jpg". */
  src: string;
  /** Collection / wall the image belongs to (source sub-folder name). */
  collection: string;
  /** Original file name. */
  fileName: string;
  /** Human-friendly title derived from the file name. */
  title: string;
  /** ── 수상작 캡션 (수상작/수상작목록.csv) ── */
  /** 수상자 이름 */
  name?: string;
  /** 국적 */
  nationality?: string;
  /** 수상 부문 (대상, 최우수상 …) */
  award?: string;
  /** 부문 순위 (0 = 가장 높은 부문) */
  awardRank?: number;
  /** 작품 설명 */
  description?: string;
  /** 입구 정면에 거는 대표 작품 */
  hero?: boolean;
  /** 원본 이미지 크기 (px, 빌드 스크립트가 읽음) */
  width?: number;
  height?: number;
}

/** 배경 사진 (수상작/배경.jpg) */
export interface ExhibitionBackground {
  src: string;
  width: number;
  height: number;
  /** 가로:세로 = 2:1 360° 파노라마 여부 */
  panorama: boolean;
}

/** 전시 정보 (수상작/전시정보.json) */
export interface ExhibitionInfo {
  상단문구?: string;
  제목?: string;
  부제?: string;
  소개문구?: string;
  안내제목?: string;
  안내문?: string;
  수상부문순서?: string[];
  /** 배경 사진 출처 표기 (첫 화면 아래에 작게) */
  배경출처?: string;
  배경출처링크?: string;
}

/** Per-artwork spotlight configuration. */
export interface SpotlightConfig {
  enabled: boolean;
  /** Warm-white by default. Hex string. */
  color: string;
  intensity: number;
  /** Cone angle in radians. */
  angle: number;
  penumbra: number;
  /** Vertical offset of the light above the artwork center (metres). */
  height: number;
  /** How far in front of the wall the light sits (metres). */
  distance: number;
}

/**
 * A placed artwork inside the exhibition. This is the authored layout data
 * produced by the visual editor and consumed by the 3D runtime.
 * Position/rotation are in world space; the editor writes them relative to walls.
 */
export interface PlacedArtwork {
  id: string;
  /** References ArtworkSource.id. */
  sourceId: string;
  src: string;
  title: string;
  /** Optional exhibition metadata shown in inspect mode. */
  artist?: string;
  year?: string;
  medium?: string;
  description?: string;
  /** 수상작 캡션 */
  nationality?: string;
  award?: string;
  awardRank?: number;
  /** 입구 정면 대표 작품(대상) */
  hero?: boolean;
  /** World position of the artwork center. */
  position: Vec3;
  /** Euler rotation (radians). */
  rotation: Vec3;
  /** Longest edge length in metres; the other edge derives from aspect ratio. */
  scale: number;
  /** Which wall/room this belongs to (for minimap + grouping). */
  roomId: string;
  /** Wall id the artwork is snapped to, if any. */
  wallId?: string;
  spotlight: SpotlightConfig;
  visited?: boolean;
  /** Empty frame shown until a real image is added. */
  placeholder?: boolean;
}

/**
 * A rectangular architectural space (room / connector / entrance) in the
 * floor plan. Axis-aligned; x0<x1, z0<z1.
 */
export interface Space {
  id: string;
  name: string;
  kind: "entrance" | "lobby" | "room" | "connector" | "reflection" | "final";
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Ceiling height (metres). Varies per space for architectural rhythm. */
  ceiling: number;
  /** Floor + wall tint overrides for a distinct atmosphere. */
  wallColor?: string;
  floorColor?: string;
  /** Optional benches: [x, z, yaw]. */
  benches?: [number, number, number][];
  /** Curation density hint (artworks per linear metre of usable wall). */
  density?: number;
  /**
   * Freestanding partition walls inside the space. They add hangable surface,
   * block sightlines, and create bays to discover — like real gallery walls.
   * Same coordinate convention as Doorway (orient/pos/min/max).
   */
  partitions?: { orient: "x" | "z"; min: number; max: number; pos: number }[];
}

/**
 * A doorway (opening) shared between two spaces. It carves a gap out of any
 * wall lying on the same line, and a lintel is rendered above it.
 * orient "x": wall is at constant X (=pos), opening spans Z in [min,max].
 * orient "z": wall is at constant Z (=pos), opening spans X in [min,max].
 */
export interface Doorway {
  orient: "x" | "z";
  pos: number;
  min: number;
  max: number;
}

/**
 * A generated wall piece used for both rendering and (optionally) collision.
 * orient "x": constant X plane spanning Z in [min,max].
 * orient "z": constant Z plane spanning X in [min,max].
 */
export interface WallSegment {
  orient: "x" | "z";
  pos: number;
  min: number;
  max: number;
  bottom: number;
  top: number;
  /** Whether the player collides with this piece (lintels are false). */
  collide: boolean;
}

/** A wall segment artworks can be mounted on. */
export interface WallSpec {
  id: string;
  roomId: string;
  /** Center of the wall face. */
  position: Vec3;
  /** Rotation of the wall face (radians); artworks inherit facing direction. */
  rotation: Vec3;
  /** Wall dimensions (width, height) in metres. */
  size: [number, number];
}

/** A room/space in the museum flow. */
export interface RoomSpec {
  id: string;
  name: string;
  /** Floor-plan center for minimap. */
  center: Vec3;
  /** Floor size (width, depth). */
  size: [number, number];
}

/** The complete authored exhibition layout. */
export interface ExhibitionLayout {
  version: number;
  updatedAt: string;
  artworks: PlacedArtwork[];
}

export interface DefaultSpotlight {
  color: string;
  intensity: number;
  angle: number;
  penumbra: number;
  height: number;
  distance: number;
}
