# 📐 SessionBoard — Pizarra Virtual Colaborativa

Aplicación web para dar clases de matemáticas en tiempo real. El profesor carga los ejercicios en HTML, comparte un código de sesión de 4 dígitos con el alumno, y ambos pueden ver y dibujar en la misma pizarra sin necesidad de que el alumno inicie sesión.

## ✨ Características

- **Sesiones instantáneas** — Código de 4 dígitos, sin registro para el alumno.
- **Dibujo colaborativo en tiempo real** — Trazos sincronizados vía Firebase Firestore.
- **Carga de ejercicios HTML** — Sube tus archivos HTML de problemas directamente.
- **Imágenes adicionales** — Añade imágenes como material extra durante la sesión.
- **Modo Interactuar / Dibujar** — Alterna entre interactuar con el HTML y dibujar encima.
- **Finalizar sesión** — Borra todos los datos de Firebase al terminar la clase.

## 🚀 Inicio Rápido

### 1. Clonar y configurar
```bash
git clone https://github.com/mfvc29/session-board.git
cd session-board
npm install
```

### 2. Configurar Firebase
```bash
cp src/environments/environment.example.ts src/environments/environment.ts
```
Edita `environment.ts` con las claves de tu proyecto Firebase.

Necesitas habilitar **Cloud Firestore** en modo producción o prueba en la consola Firebase.

### 3. Reglas de Firestore recomendadas
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sessions/{sessionId} {
      allow read, write: if true;
    }
  }
}
```

### 4. Ejecutar en local
```bash
npm run start
```

Abre `http://localhost:4200` — La app genera automáticamente un código de sesión.

## 🛠️ Stack Tecnológico

- **Angular 20** (standalone components, signals)
- **Firebase Firestore** (sync en tiempo real)
- **perfect-freehand** (trazos de dibujo fluidos)
- **lucide-angular** (iconos)

## 📁 Estructura del Proyecto

```
src/
├── app/
│   ├── board/         # Componente principal de la pizarra
│   │   ├── board.ts   # Lógica de dibujo y sesión
│   │   ├── board.service.ts  # Comunicación con Firebase
│   │   └── board.html
│   └── toolbar/       # Barra de herramientas flotante
└── environments/
    └── environment.example.ts  # Plantilla de configuración
```

## 🔒 Privacidad y Seguridad

- Las **claves de Firebase** no se incluyen en el repositorio (`environment.ts` está en `.gitignore`).
- Los archivos HTML e imágenes se almacenan **temporalmente** en Firestore hasta que el profesor finaliza la sesión.
- Al hacer clic en **Finalizar Sesión**, todos los datos se eliminan permanentemente de Firebase.
