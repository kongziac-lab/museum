전시관 음악
==========

film.mp3  한글날 도입 영상(1분)의 음악. 영상 길이 60초에 맞춘 곡이어야 한다.
          있으면 전시관 안의 영상과 npm run video:render 로 뽑는 MP4 에 함께 들어가고,
          영상이 나오는 동안은 배경음악이 쉰다(그 자리에서 멈췄다가 영상이 끝나면 이어진다).
          없으면 영상은 소리 없이 나오고 배경음악이 계속 흐른다.

tour/     그 밖의 배경음악. 이름순으로 차례로 틀고 곡과 곡을 3초씩 겹쳐 끝없이 돈다.
          비어 있거나 받지 못하면 브라우저에서 합성하는 국악풍 음악(src/lib/bgm.ts)이 흐른다.
          파일을 넣거나 빼면 npm run exhibition (dev·build 때는 저절로) 이 목록을 다시 만든다.

지금 film.mp3 는 받은 곡(1분영상2)의 앞 60초를 소리 크기 -16 LUFS 로 맞추고 끝 0.7초를 페이드한 것이다.
다른 곡으로 바꿀 때:

  ffmpeg -i 새곡.mp3 -af "atrim=0:60,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st=59.3:d=0.7" \
         -ar 48000 -ac 2 -b:a 192k public/audio/film.mp3
  (곡이 60초보다 조금 길면 atrim 앞에 atempo=<원래 길이 ÷ 60> 을 넣어 빠르기를 맞춘다)

tour/gugak-01 … 08.mp3 는 공유마당 ‘국악 배경음악’ #49 #72 #92 #94 #107 #123 #131 #143
(한국저작권위원회, CC BY — 출처 표시는 public/credits.html) 을 -18 LUFS 로 맞추고 첫 0.3초를 페이드한 것이다.
곡을 더할 때:

  ffmpeg -i 새곡.mp3 -af "loudnorm=I=-18:TP=-2:LRA=11,afade=t=in:d=0.3" \
         -ar 48000 -ac 2 -b:a 160k public/audio/tour/gugak-09.mp3

배포에 쓸 권리가 있는 음악만 넣고, 출처 표시가 필요한 곡은 credits.html 에 적는다.
