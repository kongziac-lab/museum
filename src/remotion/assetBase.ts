/**
 * 3D 장면이 부르는 파일(/scenery, /artworks, /draco)이 Remotion 에서는 public 폴더의 다른 주소에 열린다.
 * 다른 모듈보다 먼저 불러서 주소 앞부분을 정해 둔다 (src/remotion/index.ts 맨 위).
 */
import { staticFile } from "remotion";
import { setAssetBase } from "../components/gallery/scene/common";

setAssetBase(staticFile("x").slice(0, -1));
