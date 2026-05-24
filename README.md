# StartPainel Player

Player Android nativo para listas IPTV no padrão **Xtream Codes**.
Login com `DNS + Usuário + Senha`, navegação por Ao Vivo / Filmes / Séries,
player Media3/ExoPlayer e UI adaptativa para celular e Android TV.

## Stack

- **Kotlin 2.0** + **Jetpack Compose** (Material 3)
- **Media3 / ExoPlayer 1.4** (HLS, MPEG-TS, MP4)
- **Retrofit 2** + **kotlinx.serialization**
- **Coil 2** (logos e capas)
- **DataStore Preferences** (credenciais)
- DI manual (sem Hilt) para builds mais leves
- minSdk 21 / targetSdk 34

## Estrutura

```
app/src/main/java/com/startpainel/player/
├── MainActivity.kt              Activity única (Compose + edge-to-edge)
├── PainelApp.kt                 Application
├── ServiceLocator.kt            DI manual
├── data/
│   ├── model/Account.kt         DNS + user + senha + builders de URL
│   ├── local/CredentialsStore   DataStore para sessão
│   └── remote/
│       ├── XtreamApi.kt         Retrofit interface
│       ├── XtreamRepository.kt  Lógica + parse de "episodes" dinâmico
│       └── dto/                 DTOs (com serializers flexíveis)
├── ui/
│   ├── theme/                   Cores, tipografia, MaterialTheme
│   ├── components/              PosterCard, ChannelRow, Loading, Error, Empty
│   ├── login/                   Tela inicial
│   ├── home/                    Tabs Ao vivo / Filmes / Séries + categorias
│   ├── series/                  Detalhe da série com temporadas/episódios
│   └── player/                  Player fullscreen com controles custom
├── navigation/PainelNavGraph    Navegação Compose
└── util/DeviceType.kt           Detecta TV (leanback / uiMode)
```

## Como abrir

### Opção A — Android Studio (recomendado)
1. Abra o **Android Studio (Koala 2024.1+)**
2. `File → Open` e selecione a pasta `android-player`
3. Aguarde o Gradle sync (vai baixar dependências automaticamente)
4. O Android Studio detecta a ausência do `gradle-wrapper.jar` e oferece gerar — aceite
5. Selecione um dispositivo/emulador e clique em **Run** ▶

### Opção B — Linha de comando
```powershell
cd android-player
# Gerar o wrapper (apenas na primeira vez)
gradle wrapper --gradle-version 8.9
# Compilar debug
.\gradlew assembleDebug
# Instalar no dispositivo conectado (USB debugging habilitado)
.\gradlew installDebug
```

> Precisa do **JDK 17+** e do **Android SDK** com plataforma 34 instalada.

## Fluxo de uso

1. **Login**
   - DNS: `http://starton.sbs:8880` (sem `/get.php`, só o host:porta)
   - Usuário: `Holanda2026`
   - Senha: `vuafsr7x`
   - O app chama `player_api.php?username=...&password=...` para validar
2. **Home**
   - Aba **Ao vivo**: lista de canais com logo, filtro por categoria, busca por nome
   - Aba **Filmes**: grade de pôsteres
   - Aba **Séries**: grade de pôsteres → toque abre temporadas/episódios
3. **Player**
   - Toque na tela para mostrar/ocultar controles
   - Controles desaparecem após 4s
   - Em VOD aparece slider de progresso; em Live mostra badge "AO VIVO"

## URLs de stream (geradas a partir da conta)

- Live: `{DNS}/live/{user}/{pass}/{streamId}.ts`
- Filme: `{DNS}/movie/{user}/{pass}/{streamId}.{ext}`
- Série/episódio: `{DNS}/series/{user}/{pass}/{episodeId}.{ext}`

## Android TV

O `AndroidManifest.xml` declara `LEANBACK_LAUNCHER` e `leanback` opcional.
Os componentes usam `FocusableSurface` (escala + borda em foco) para D-pad funcionar
naturalmente sem precisar do `androidx.tv.foundation` (que ainda é alpha).

Banner de 320×180 está em `res/drawable/ic_tv_banner.xml`.

## Próximos passos sugeridos

- **EPG** (`player_api.php?action=get_short_epg`)
- **Favoritos** + histórico (Room)
- **Múltiplos perfis** (lista de Accounts no DataStore)
- **Resume** de filmes/episódios (salvar `currentPosition`)
- **PiP** (Picture-in-Picture) no player
- **Catch-up TV** quando `tv_archive=1`
- Migrar UI da TV para `androidx.tv:tv-material` quando sair de alpha

## Segurança

- Credenciais ficam **apenas no DataStore local** do dispositivo
- `cleartextTraffic=true` está habilitado porque maioria dos provedores Xtream usa HTTP
- `backup_rules.xml` exclui `credentials.xml` de backups na nuvem

## Aviso legal

Este player é uma ferramenta genérica. Use somente com listas/serviços que você tem
autorização legal para consumir.
