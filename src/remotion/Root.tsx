import { Composition, Series, staticFile, type CalculateMetadataFunction } from "remotion";
import { DURATION, FPS, HangulDay, OPENER, Opener, defaultProps, propsFromExhibition, type HangulDayProps } from "./HangulDay";
import { GateWalk, WALK_DURATION, walkDefaults, type GateWalkProps } from "./GateWalk";
import { Tour, tourFrames } from "./Tour";

type Exhibition = Parameters<typeof propsFromExhibition>[0] & { artworks?: GateWalkProps["arts"]; background?: GateWalkProps["background"] };

async function exhibition(): Promise<Exhibition | null> {
  try {
    return await (await fetch(staticFile("exhibition.json"))).json();
  } catch {
    return null;
  }
}

/** 영상 props: 전시 작품 목록(public/exhibition.json, npm run exhibition 이 만든다)의 이름과 전시 정보 */
function filmProps(j: Exhibition, base: HangulDayProps): HangulDayProps {
  const next = propsFromExhibition(j);
  // 스튜디오·렌더에서는 public 파일을 staticFile 로 가리켜야 한다
  return { ...base, ...next, music: next.music ? staticFile(next.music.replace(/^\//, "")) : null };
}
function walkProps(j: Exhibition): GateWalkProps {
  return { arts: j.artworks ?? [], info: (j as { info?: GateWalkProps["info"] }).info ?? {}, background: j.background ?? null };
}

const withFilm: CalculateMetadataFunction<HangulDayProps> = async ({ props }) => {
  const j = await exhibition();
  return { props: j ? filmProps(j, props) : props };
};
const withWalk: CalculateMetadataFunction<GateWalkProps> = async ({ props }) => {
  const j = await exhibition();
  return { props: j ? walkProps(j) : props };
};

type FullProps = { film: HangulDayProps; walk: GateWalkProps };
const withBoth: CalculateMetadataFunction<FullProps> = async ({ props }) => {
  const j = await exhibition();
  return { props: j ? { film: filmProps(j, props.film), walk: walkProps(j) } : props };
};

/** 한글날 영상(60초) 뒤에 정문 → 전시장 3D 장면을 잇는다 */
function HangulDayFull({ film, walk }: FullProps) {
  return (
    <Series>
      <Series.Sequence durationInFrames={DURATION} name="한글날 영상">
        <HangulDay {...film} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={WALK_DURATION} name="정문 → 전시장">
        <GateWalk {...walk} />
      </Series.Sequence>
    </Series>
  );
}

/**
 * 전체 한 편: 580돌·100돌(5초) → 한글날 영상(60초, 음악 없이) → 정문에서 작품 50점 끝까지 자동 관람 → 하늘에서 마무리.
 * 길이는 작품 수로 정해진다 (50점이면 약 12분).
 */
function HangulDayComplete({ film, walk }: FullProps) {
  return (
    <Series>
      <Series.Sequence durationInFrames={OPENER} name="580돌 · 100돌">
        <Opener {...film} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={DURATION} name="한글날 영상">
        <HangulDay {...film} music={null} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={tourFrames(walk.arts.length)} name="정문 → 작품 50점 → 하늘">
        <Tour {...walk} />
      </Series.Sequence>
    </Series>
  );
}
const withAll: CalculateMetadataFunction<FullProps> = async (args) => {
  const { props } = await withBoth(args);
  const all = props as FullProps;
  return { props: all, durationInFrames: OPENER + DURATION + tourFrames(all.walk.arts.length) };
};

export function RemotionRoot() {
  const full: FullProps = { film: defaultProps, walk: walkDefaults };
  return (
    <>
      <Composition id="HangulDay" component={HangulDay} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} defaultProps={defaultProps} calculateMetadata={withFilm} />
      <Composition id="HangulDayVertical" component={HangulDay} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} defaultProps={defaultProps} calculateMetadata={withFilm} />
      <Composition id="GateWalk" component={GateWalk} durationInFrames={WALK_DURATION} fps={FPS} width={1920} height={1080} defaultProps={walkDefaults} calculateMetadata={withWalk} />
      <Composition id="GateWalkVertical" component={GateWalk} durationInFrames={WALK_DURATION} fps={FPS} width={1080} height={1920} defaultProps={walkDefaults} calculateMetadata={withWalk} />
      <Composition id="HangulDayFull" component={HangulDayFull} durationInFrames={DURATION + WALK_DURATION} fps={FPS} width={1920} height={1080} defaultProps={full} calculateMetadata={withBoth} />
      <Composition id="HangulDayFullVertical" component={HangulDayFull} durationInFrames={DURATION + WALK_DURATION} fps={FPS} width={1080} height={1920} defaultProps={full} calculateMetadata={withBoth} />
      <Composition id="HangulDayComplete" component={HangulDayComplete} durationInFrames={OPENER + DURATION + tourFrames(50)} fps={FPS} width={1920} height={1080} defaultProps={full} calculateMetadata={withAll} />
      <Composition id="HangulDayCompleteVertical" component={HangulDayComplete} durationInFrames={OPENER + DURATION + tourFrames(50)} fps={FPS} width={1080} height={1920} defaultProps={full} calculateMetadata={withAll} />
    </>
  );
}
