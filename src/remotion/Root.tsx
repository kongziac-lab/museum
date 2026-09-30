import { Composition, staticFile, type CalculateMetadataFunction } from "remotion";
import { DURATION, FPS, HangulDay, defaultProps, propsFromExhibition, type HangulDayProps } from "./HangulDay";

/** 스튜디오·렌더에서는 전시 작품 목록(public/exhibition.json, npm run exhibition 이 만든다)의 이름과 전시 정보를 쓴다 */
const withExhibition: CalculateMetadataFunction<HangulDayProps> = async ({ props }) => {
  try {
    const res = await fetch(staticFile("exhibition.json"));
    return { props: { ...props, ...propsFromExhibition(await res.json()) } };
  } catch {
    return { props };
  }
};

export function RemotionRoot() {
  return (
    <>
      <Composition id="HangulDay" component={HangulDay} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} defaultProps={defaultProps} calculateMetadata={withExhibition} />
      <Composition id="HangulDayVertical" component={HangulDay} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} defaultProps={defaultProps} calculateMetadata={withExhibition} />
    </>
  );
}
