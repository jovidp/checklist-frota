@echo off
rem ==========================================================================
rem  CHECKLIST DE CAMINHOES - iniciador para Windows
rem  Basta dar dois cliques neste arquivo.
rem ==========================================================================

rem Pagina de codigo UTF-8 para os acentos aparecerem corretamente.
chcp 65001 >nul 2>&1

title Checklist de Caminhoes
color 0F

rem Trabalha sempre na pasta onde este arquivo esta, nao na pasta do atalho.
cd /d "%~dp0"

cls
echo ============================================================
echo   CHECKLIST DE CAMINHOES
echo   Iniciando o sistema, aguarde...
echo ============================================================
echo.

rem --------------------------------------------------------------------------
rem 1) O Node.js esta instalado?
rem --------------------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 goto SEM_NODE

for /f "tokens=*" %%v in ('node --version 2^>nul') do set "VERSAO_NODE=%%v"
echo [1/4] Node.js encontrado: %VERSAO_NODE%
echo.

rem --------------------------------------------------------------------------
rem 2) Dependencias instaladas?
rem --------------------------------------------------------------------------
if exist "node_modules" goto DEPS_OK

echo [2/4] Primeira execucao: instalando os componentes necessarios.
echo       Isso pode levar alguns minutos. Nao feche esta janela.
echo.
call npm install
if errorlevel 1 goto ERRO_NPM
echo.
echo       Componentes instalados com sucesso.
echo.
goto BANCO

:DEPS_OK
echo [2/4] Componentes ja instalados.
echo.

rem --------------------------------------------------------------------------
rem 3) Banco de dados criado?
rem --------------------------------------------------------------------------
:BANCO
if exist "data\checklist.db" goto BANCO_OK

echo [3/4] Preparando o banco de dados pela primeira vez...
echo.
call npm run migrate
if errorlevel 1 goto ERRO_BANCO
call npm run seed
if errorlevel 1 goto ERRO_BANCO
echo.
echo       Banco de dados pronto.
echo.
goto SERVIDOR

:BANCO_OK
echo [3/4] Banco de dados ja existe.
echo.

rem --------------------------------------------------------------------------
rem 4) Sobe o servidor e abre o navegador
rem --------------------------------------------------------------------------
:SERVIDOR
rem A porta vem do arquivo .env (o servidor le o mesmo valor). Sem .env,
rem vale o padrao 3000 usado em src\config.js.
set "PORTA=3000"
if exist ".env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
    if /i "%%a"=="PORT" set "PORTA=%%b"
  )
)
set "PORTA=%PORTA: =%"
if "%PORTA%"=="" set "PORTA=3000"

echo [4/4] Iniciando o servidor...
echo.
echo       Endereco: http://localhost:%PORTA%
echo       O navegador abrira sozinho em instantes.
echo.
echo       Para ENCERRAR o sistema: feche esta janela ou pressione Ctrl+C.
echo ============================================================
echo.

rem Abre o navegador em segundo plano, dando tempo do servidor subir.
start "" /min cmd /c "timeout /t 5 /nobreak >nul & start "" http://localhost:%PORTA%"

rem O servidor roda em primeiro plano: esta janela e o painel do sistema.
node src\server.js

echo.
echo ============================================================
echo   O servidor foi encerrado.
echo ============================================================
echo.
pause
goto FIM

rem --------------------------------------------------------------------------
rem Mensagens de erro
rem --------------------------------------------------------------------------
:SEM_NODE
color 4F
echo ============================================================
echo   O Node.js NAO esta instalado neste computador.
echo ============================================================
echo.
echo   O sistema precisa do Node.js para funcionar.
echo.
echo   COMO RESOLVER:
echo     1. Abra o site oficial:  https://nodejs.org
echo     2. Baixe a versao "LTS" para Windows.
echo     3. Instale clicando em "Avancar" ate o final.
echo     4. FECHE esta janela e clique de novo em INICIAR.bat
echo.
echo   Observacao: e necessario Node.js 22.5 ou superior.
echo.
start "" https://nodejs.org
pause
goto FIM

:ERRO_NPM
color 4F
echo.
echo ============================================================
echo   Falha ao instalar os componentes.
echo ============================================================
echo.
echo   Verifique se o computador esta conectado a internet
echo   e tente novamente. Se o erro continuar, envie a mensagem
echo   acima para o responsavel pelo sistema.
echo.
pause
goto FIM

:ERRO_BANCO
color 4F
echo.
echo ============================================================
echo   Falha ao preparar o banco de dados.
echo ============================================================
echo.
echo   Confira se a pasta "data" pode ser gravada e se nenhum
echo   antivirus esta bloqueando o programa. Consulte a secao
echo   "Solucao de problemas" do arquivo README.md.
echo.
pause
goto FIM

:FIM
