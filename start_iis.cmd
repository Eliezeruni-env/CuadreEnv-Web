@echo off
set ASPNETCORE_ENVIRONMENT=Development
set LAUNCHER_PATH=C:\Users\pelie\source\repos\MyDev\cuadreEnv\api\crud-onion\bin\Debug\net10.0\crud-onion.exe
set LAUNCHER_ARGS=
"C:\Program Files\IIS Express\iisexpress.exe" /config:"C:\Users\pelie\source\repos\MyDev\cuadreEnv\api\.vs\crud-onion.slnx\config\applicationhost.config" /site:"crud-onion" /apppool:"crud-onion AppPool"
