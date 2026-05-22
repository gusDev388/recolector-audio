import React, { useState, useRef, useEffect } from 'react';
import { db, storage, auth } from './firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';

export default function App() {
  const [fase, setFase] = useState(1);
  const [consentimiento, setConsentimiento] = useState(() => {
    return localStorage.getItem('recolector_completado') === 'true' || localStorage.getItem('recolector_consentimiento') === 'true';
  });
  const [yaParticipo, setYaParticipo] = useState(() => {
    return localStorage.getItem('recolector_completado') === 'true';
  });


  // Generación de ID
  // const [userId] = useState(() => {
  //   const guardado = localStorage.getItem('recolector_user_id');
  //   if (guardado) return guardado;
  //   const nuevoId = 'user_' + Math.random().toString(36).substring(2, 9);
  //   localStorage.setItem('recolector_user_id', nuevoId);
  //   return nuevoId;
  // });

  //AUTENTICACIÓN ANÓNIMA CON FIREBASE
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);
          setAuthReady(true);
        } else {
          const result = await signInAnonymously(auth);
          setUser(result.user);
          setAuthReady(true);
        }
      } catch (error) {
        console.error("Error en autenticación anónima:", error);
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const userId = user?.uid;
  // FIN DE AUTENTICACIÓN

  const [grabando, setGrabando] = useState(false);
  const [tiempo, setTiempo] = useState(0);
  const [texto, setTexto] = useState('Cargando texto...');
  const [subiendo, setSubiendo] = useState(false);
  const [estadoEnvio, setEstadoEnvio] = useState(''); 
  const [bloquearSiguiente, setBloquearSiguiente] = useState(true);
  const [perfilVoz, setPerfilVoz] = useState('');
  
  // ESTADOS MODIFICADOS Y NUEVOS PARA REVISIÓN
  const [audioBuffer, setAudioBuffer] = useState(null); 
  const [audioUrl, setAudioUrl] = useState(null);    
  const [duracionGrabada, setDuracionGrabada] = useState(0); 

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const tiempoRef = useRef(0); 
  const inicioGrabacionRef = useRef(0); 

  const textoFijo = "El viento del norte y el sol disputaban sobre cuál de ellos era el más fuerte, cuando vio acercarse a un viajero envuelto en una capa. Acordaron que el primero que lograra que el viajero se quitara la capa sería considerado más poderoso. El viento del norte sopló con gran furia, pero cuanto más soplaba, más se envolvía el viajero en su capa. Al fin, el viento desistió. Entonces el sol brilló con todo su esplendor e inmediatamente el viajero se quitó la capa.\n\nPor otra parte, un cuervo sediento volaba bajo el cielo caluroso buscando un poco de agua. Encontró una jarra en el fondo de un jardín, pero el nivel del agua era tan bajo que su pico no alcanzaba a tocarla. Lejos de rendirse, el ave comenzó a recoger piedras pequeñas con su pico y las fue arrojando una a una dentro del recipiente. Con cada piedra, el agua subía un poco más, hasta que finalmente llegó al borde y el cuervo pudo calmar su sed, demostrando que la paciencia y el ingenio vencen a la fuerza.";
  
  const preguntasLibres = [
    "Cuéntame detalladamente qué hiciste desde que te levantaste hoy hasta este momento.",
    "Describe tu película o libro favorito como si se lo estuvieras recomendando a un amigo, pero sin decir el final.",
    "Si pudieras viajar a cualquier parte del mundo mañana mismo con todo pagado, ¿a dónde irías y qué harías allí?",
    "Explícame cómo se prepara tu platillo de comida favorito paso a paso.",
    "¿Cuál es el recuerdo más divertido o feliz que tienes de tu infancia?"
  ];

  const textoLecturaOpcional = "El estudio de las ondas sonoras y la acústica aplicada ha permitido descifrar los patrones mecánicos que componen el habla humana. Cada individuo posee una firma acústica única determinada por la fisiología de sus cuerdas vocales, la cavidad nasal y los hábitos de articulación. Este registro busca almacenar de forma puramente matemática dichos espectros de frequency con el fin de alimentar modelos de reconocimiento de patrones fonéticos sin invadir la identidad personal.";

  // Limpieza profunda al cambiar de etapa
  useEffect(() => {
    if (yaParticipo) {
      setFase(4);
      return;
    }
    
    setTiempo(0);
    tiempoRef.current = 0;
    setBloquearSiguiente(true);
    setEstadoEnvio('');
    setDuracionGrabada(0);
    setAudioBuffer(null);
    
    // Liberar memoria del audio anterior si existe
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    
    if (fase === 1) {
      setTexto(textoFijo);
    } else if (fase === 2) {
      setTexto("Cargando fragmento dinámico de Wikipedia...");
      obtenerTextoWikipedia();
    } else if (fase === 3) {
      const preguntaAzar = preguntasLibres[Math.floor(Math.random() * preguntasLibres.length)];
      setTexto(`Pregunta sugerida para habla libre:\n\n"${preguntaAzar}"`);
    }
  }, [fase, consentimiento, yaParticipo]);

  useEffect(() => {
    if (grabando) {
      timerRef.current = setInterval(() => {
        setTiempo((prev) => {
          const nuevoTiempo = prev >= 60 ? 60 : prev + 1;
          tiempoRef.current = nuevoTiempo; 
          if (nuevoTiempo >= 60) {
            detenerGrabacion();
          }
          return nuevoTiempo;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [grabando]);

  const obtenerTextoWikipedia = async () => {
    try {
      const temas = [
        "Historia de México", "Geografía de México", "Cultura de América Latina", 
        "Gastronomía mexicana", "Revolución Mexicana", "Civilización maya", 
        "Cine de Oro mexicano", "Pueblos indígenas de México", "Tradiciones de México", 
        "Día de Muertos", "Literatura latinoamericana", "Arte precolombino",
        "Biodiversidad en América Latina", "Música regional", 
        "Inteligencia artificial en América Latina", "Historia del Estado de Hidalgo", 
        "Pachuca de Soto"
      ];
      
      // 2. Elegimos un tema de la lista al azar
      const temaAleatorio = temas[Math.floor(Math.random() * temas.length)];
      
      const offset = Math.floor(Math.random() * 10);

      // 4. Cambiamos la URL para usar generator=search en lugar de generator=random
      const url = `https://es.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&generator=search&gsrsearch=${encodeURIComponent(temaAleatorio)}&gsrlimit=1&gsroffset=${offset}&exchars=800&exintro=1&explaintext=1&origin=*`;

      const res = await fetch(url);
      const data = await res.json();
      
      // Si la búsqueda no arroja resultados, reintentamos
      if (!data.query || !data.query.pages) {
        return obtenerTextoWikipedia();
      }

      const pages = data.query.pages;
      const extract = pages[Object.keys(pages)[0]].extract;

      // Validación: Si el texto es muy corto para una buena muestra de voz, volvemos a intentar
      if (!extract || extract.length < 600) {
        return obtenerTextoWikipedia();
      }
      
      setTexto(extract);
    } catch (err) {
      console.error("Error en Wikipedia:", err);
      // Texto de respaldo por si el internet o la API fallan
      setTexto("La inteligencia artificial y el procesamiento de señales de audio han revolucionado la tecnología en América Latina. A través del análisis espectrográfico, se busca aislar ruido ambiental y segmentar locutores eficazmente para crear herramientas más adaptadas a nuestros acentos.");
    }
  };

  const cambiarATextoLectura = () => {
    setTexto(`Opción de lectura alternativa (Fase 3):\n\n${textoLecturaOpcional}`);
  };

  const iniciarGrabacion = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      audioChunksRef.current = []; 
      tiempoRef.current = 0;
      setTiempo(0); 
      setDuracionGrabada(0);
      setAudioBuffer(null);
      setEstadoEnvio('');
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }

      inicioGrabacionRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());

        const tiempoFinalMilisegundos = Date.now() - inicioGrabacionRef.current;
        const duracionRealSegundos = tiempoFinalMilisegundos / 1000;

        if (duracionRealSegundos < 5) {
          alert(`La grabación duró solo ${duracionRealSegundos.toFixed(1)} segundos reales. Debe durar al menos 5 segundos para revisión.`);
          return;
        }

        // CAMBIO AQUÍ: No sube automáticamente. Genera URL local y guarda datos en estados.
        const urlLocal = URL.createObjectURL(audioBlob);
        setAudioUrl(urlLocal);
        setAudioBuffer(audioBlob);
        setDuracionGrabada(duracionRealSegundos);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setGrabando(true);

    } catch (error) {
      console.error("Error al acceder al micrófono:", error);
      alert("No se pudo acceder al micrófono. Por favor, otorga los permisos.");
    }
  };

  const detenerGrabacion = () => {
    if (mediaRecorderRef.current && grabando) {
      mediaRecorderRef.current.stop(); 
      setGrabando(false);
    }
  };

  // Acción para descartar el audio actual y limpiar la interfaz
  const volverAGrabar = () => {
    setAudioBuffer(null);
    setDuracionGrabada(0);
    setEstadoEnvio('');
    setTiempo(0);
    tiempoRef.current = 0;
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  };


  // NUEVA VERSIÓN DE LA FUNCIÓN DE ENVÍO CON VERIFICACIÓN DE SESIÓN ANÓNIMA
  const confirmarYEnviarAStorage = async () => {
    if (!audioBuffer) return;
    if (!auth.currentUser) {
      setEstadoEnvio('error');
      alert("No hay sesión anónima activa. Recarga la página e intenta de nuevo.");
      return;
    }

    const uid = auth.currentUser.uid;

    setSubiendo(true);
    setEstadoEnvio('subiendo');

    const rutaArchivo = `audios/${uid}/fase_${fase}.webm`;
    const storageRef = ref(storage, rutaArchivo);

    try {
      await uploadBytes(storageRef, audioBuffer, {
        contentType: 'audio/webm'
      });
      await addDoc(collection(db, "grabaciones"), {
        userId: uid,
        fase: fase,
        textoAsociado: texto,
        audioPath: rutaArchivo,
        duracionSegundos: duracionGrabada,
        perfilVoz: perfilVoz || localStorage.getItem('recolector_perfil_voz') || 'prefiero_no_decirlo',
        fecha: new Date().toISOString()
      });

      setSubiendo(false);
      setEstadoEnvio('exito');
      setBloquearSiguiente(false);
    } catch (error) {
      console.error("Error al subir a Firebase:", error);
      setSubiendo(false);
      setEstadoEnvio('error');
    }
  };

  const avanzarFase = () => {
    if (fase === 3) {
      localStorage.setItem('recolector_completado', 'true');
      setYaParticipo(true);
      setFase(4);
    } else {
      setFase(prev => prev + 1);
    }
  };

  const formatearTiempo = (segundos) => {
    const mins = Math.floor(segundos / 60);
    const secs = segundos % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const aceptarConsentimiento = () => {
    if (!perfilVoz) {
      alert("Selecciona una opción antes de continuar.");
      return;
    }

    localStorage.setItem('recolector_consentimiento', 'true');
    localStorage.setItem('recolector_perfil_voz', perfilVoz);
    setConsentimiento(true);
  };

  if (!authReady) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.parrafo}>Inicializando sesión segura...</p>
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.parrafo}>
            No se pudo crear una sesión anónima segura. Intenta recargar la página.
          </p>
        </div>
      </div>
    );
  }

  // VISTA 1: FINALIZADO
  if (yaParticipo || fase === 4) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.successIcon}>🎉</div>
          <h1 style={styles.tituloPrincipal}>¡Misión Cumplida!</h1>
          <p style={styles.parrafo}>
            Tu participación ha sido registrada con éxito. Tus tres segmentos de voz ya forman parte del dataset de investigación.
          </p>
          <div style={styles.lockBadge}>
            🔒 Bloqueo de seguridad activado: No se permiten envíos duplicados desde este dispositivo.
          </div>
          <p style={{...styles.parrafo, color: '#7f8c8d', marginTop: '20px', fontSize: '0.9rem'}}>
            Identificador único de datos: <strong>{userId}</strong>
          </p>
        </div>
      </div>
    );
  }

  // VISTA 2: CONSENTIMIENTO
  if (!consentimiento) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.tituloPrincipal}>Proyecto de Recolección de Voz</h1>
          <p style={styles.parrafo}>
            Este sistema captura características acústicas del habla para el desarrollo de herramientas multilenguaje y modelos de aislamiento de señales fonéticas.
          </p>
          
          <div style={styles.alertBox}>
            <h3 style={styles.alertTitle}>🛡️ Garantía Ética y Uso de Datos</h3>
            <p style={styles.alertText}>
              Las muestras obtenidas formarán parte de un corpus abierto de investigación científica. <strong> El uso de estos archivos NO SON para clonación artificial de voz o suplantación biométrica.</strong> La identidad de los voluntarios permanece anónima.
            </p>
          </div>

          <div style={styles.instructionsBox}>
            <h3 style={styles.instructionsTitle}>📌 Instrucciones antes de comenzar</h3>
            <ul style={styles.instructionsList}>
              <li>Busca un lugar lo más silencioso posible.</li>
              <li>Habla de forma clara, natural y sin forzar la voz.</li>
              <li>Mantén el micrófono a una distancia estable.</li>
              <li>Evita reproducir música, televisión o ruido de fondo.</li>
              <li>Revisa cada grabación antes de enviarla.</li>
            </ul>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              Perfil de voz reportado:
            </label>

            <select
              value={perfilVoz}
              onChange={(e) => setPerfilVoz(e.target.value)}
              style={styles.select}
            >
              <option value="">Selecciona una opción</option>
              <option value="masculina">Masculina</option>
              <option value="femenina">Femenina</option>
              <option value="prefiero_no_decirlo">Prefiero no decirlo</option>
            </select>

            <p style={styles.helperText}>
              Este dato es opcional para fines de clasificación general del corpus de voz y no se usará para identificarte personalmente.
            </p>
          </div>

          <button onClick={aceptarConsentimiento} style={styles.btnAceptar}>
            Acepto las condiciones y deseo empezar
          </button>
        </div>
      </div>
    );
  }

  // VISTA 3: FLUJO COMPLETO DE GRABACIÓN Y REVISIÓN
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        
        {/* COMPONENTE: PROGRESO */}
        <div style={styles.timelineContainer}>
          <div style={{...styles.timelineStep, ...(fase >= 1 ? styles.stepActive : {})}}>
            <div style={styles.stepNumber}>{fase > 1 ? '✓' : '1'}</div>
            <div style={styles.stepLabel}>Fijo</div>
          </div>
          <div style={styles.timelineLine}></div>
          <div style={{...styles.timelineStep, ...(fase >= 2 ? styles.stepActive : {})}}>
            <div style={styles.stepNumber}>{fase > 2 ? '✓' : '2'}</div>
            <div style={styles.stepLabel}>Dinámico</div>
          </div>
          <div style={styles.timelineLine}></div>
          <div style={{...styles.timelineStep, ...(fase >= 3 ? styles.stepActive : {})}}>
            <div style={styles.stepNumber}>3</div>
            <div style={styles.stepLabel}>Libre</div>
          </div>
        </div>

        <div style={styles.metaHeader}>
          <span style={styles.userIdText}>Sesión: {userId}</span>
        </div>
        
        <div style={{ ...styles.cronometro, color: grabando ? '#e74c3c' : '#2c3e50' }}>
          {grabando && <span style={styles.dotRojo}></span>}
          {formatearTiempo(audioUrl ? duracionGrabada : tiempo)} <span style={{fontSize: '1.1rem', color: '#95a5a6'}}> / 01:00</span>
        </div>

        <p style={{ color: '#475569', fontSize: '0.95rem', fontWeight: '600', marginBottom: '10px', textAlign: 'left' }}>
          {fase === 1 && "📋 Instrucción: Lee el siguiente texto completo de forma clara, pausada y a un ritmo natural:"}
          {fase === 2 && "📋 Instrucción: Lee el fragmento de Wikipedia de corrido hasta que decidas detener la grabación:"}
          {fase === 3 && "📋 Instrucción: Responde a la pregunta de forma espontánea o lee el texto alternativo si lo prefieres:"}
        </p>

        <div style={styles.cajaTexto}>
          {texto}
        </div>

        {fase === 3 && !grabando && !audioUrl && (
          <button onClick={cambiarATextoLectura} style={styles.btnAlternativo}>
            📖 Prefiero leer un texto en lugar de responder
          </button>
        )}

        {/* COMPONENTE NUEVO: REPRODUCTOR DE AUDIO DE REVISIÓN */}
        {audioUrl && (
          <div style={styles.audioPlayerContainer}>
            <p style={styles.audioPlayerTitle}>🎧 Revisa tu grabación:</p>
            <audio src={audioUrl} controls style={styles.audioElement} />
          </div>
        )}

        {/* FEEDBACK VISUAL */}
        <div style={styles.statusView}>
          {estadoEnvio === 'subiendo' && <div style={styles.loaderText}>⏳ Sincronizando audio...</div>}
          {estadoEnvio === 'exito' && <div style={styles.successText}>✔ ¡Audio asegurado con éxito! Puedes avanzar al siguiente paso.</div>}
          {estadoEnvio === 'error' && <div style={styles.errorText}>❌ Error en la conexión. Vuelve a intentar el segmento.</div>}
        </div>

        <div style={styles.contenedorBotones}>
          {/* BOTÓN MODO: INICIAL (Listo para grabar) */}
          {!grabando && !audioUrl && (
            <button onClick={iniciarGrabacion} style={styles.btnGrabar}>
              🎙️ Grabar
            </button>
          )}

          {/* BOTÓN MODO: GRABANDO */}
          {grabando && (
            <button onClick={detenerGrabacion} style={styles.btnDetener}>
              ⏹️ Detener
            </button>
          )}

          {/* BOTONES MODO: REVISIÓN (Audio capturado, esperando confirmación) */}
          {audioUrl && estadoEnvio !== 'exito' && (
            <>
              <button onClick={volverAGrabar} disabled={subiendo} style={{...styles.btnVolver, opacity: subiendo ? 0.5 : 1, cursor: subiendo ? 'not-allowed' : 'pointer'}}>
                🔄 Volver a grabar
              </button>
              <button onClick={confirmarYEnviarAStorage} disabled={subiendo} style={{...styles.btnConfirmar, opacity: subiendo ? 0.5 : 1, cursor: subiendo ? 'not-allowed' : 'pointer'}}>
                {subiendo ? 'Subiendo...' : '📤 Guardar y Enviar'}
              </button>
            </>
          )}

          {/* BOTÓN MODO: NAVEGACIÓN (Desbloqueado tras éxito) */}
          <button 
            onClick={avanzarFase} 
            disabled={bloquearSiguiente || grabando || (audioUrl && estadoEnvio !== 'exito')} 
            style={{ 
              ...styles.btnSiguiente, 
              background: fase === 3 ? '#9b59b6' : '#3498db',
              cursor: (bloquearSiguiente || grabando || (audioUrl && estadoEnvio !== 'exito')) ? 'not-allowed' : 'pointer', 
              opacity: (bloquearSiguiente || grabando || (audioUrl && estadoEnvio !== 'exito')) ? 0.3 : 1 
            }}
          >
            {fase === 3 ? 'Finalizar Flujo 🎉' : 'Siguiente Segmento →'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#1e293b', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  card: { background: '#ffffff', maxWidth: '600px', width: '100%', padding: '35px', borderRadius: '20px', boxShadow: '0 15px 35px rgba(0,0,0,0.03)', textAlign: 'center', border: '1px solid #eef2f5' },
  tituloPrincipal: { color: '#1e293b', fontSize: '1.7rem', marginBottom: '15px', fontWeight: '700' },
  parrafo: { color: '#64748b', fontSize: '1rem', lineHeight: '1.6', marginBottom: '20px' },
  alertBox: { background: '#fffbeb', borderLeft: '4px solid #f59e0b', padding: '15px 20px', borderRadius: '10px', textAlign: 'left', marginBottom: '25px' },
  alertTitle: { margin: '0 0 6px 0', color: '#b45309', fontSize: '1rem', fontWeight: '600' },
  alertText: { margin: 0, color: '#78350f', fontSize: '0.9rem', lineHeight: '1.5' },
  btnAceptar: { background: '#2563eb', color: '#fff', border: 'none', padding: '14px', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', width: '100%' },
  timelineContainer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '30px', padding: '0 10px' },
  timelineStep: { display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#cbd5e1', flex: 1 },
  stepActive: { color: '#2563eb' },
  stepNumber: { width: '32px', height: '32px', borderRadius: '50%', background: 'currentColor', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.9rem', marginBottom: '6px' },
  stepLabel: { fontSize: '0.8rem', fontWeight: '600', color: '#64748b' },
  timelineLine: { height: '2px', background: '#e2e8f0', flex: '1', marginPosition: 'relative', top: '-10px', margin: '0 10px', maxWidth: '70px' },
  metaHeader: { textAlign: 'right', marginBottom: '10px' },
  userIdText: { color: '#94a3b8', fontSize: '0.8rem', fontFamily: 'monospace' },
  cronometro: { fontSize: '2.5rem', fontWeight: '800', marginBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
  dotRojo: { width: '12px', height: '12px', background: '#e74c3c', borderRadius: '50%', animation: 'blink 1s infinite' },
  cajaTexto: { whiteSpace: 'pre-line', textAlign: 'justify', background: '#f1f5f9', padding: '22px', borderRadius: '12px', lineHeight: '1.65', fontSize: '1.05rem', color: '#334155', marginBottom: '20px', border: '1px solid #e2e8f0', minHeight: '100px' },
  btnAlternativo: { background: 'none', border: 'none', color: '#2563eb', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', marginBottom: '20px', textDecoration: 'underline' },
  statusView: { minHeight: '30px', marginBottom: '20px', fontSize: '0.9rem', fontWeight: '500' },
  loaderText: { color: '#d97706' },
  successText: { color: '#16a34a' },
  errorText: { color: '#dc2626' },
  contenedorBotones: { display: 'flex', gap: '15px' },
  btnGrabar: { background: '#10b981', color: '#fff', border: 'none', padding: '14px 20px', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '600', flex: 1, cursor: 'pointer' },
  btnDetener: { background: '#ef4444', color: '#fff', border: 'none', padding: '14px 20px', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '600', flex: 1, cursor: 'pointer' },
  btnSiguiente: { color: '#fff', border: 'none', padding: '14px 20px', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '600', flex: 1 },
  successIcon: { fontSize: '4rem', marginBottom: '15px' },
  lockBadge: { background: '#f8f9fa', border: '1px dashed #cbd5e1', padding: '12px', borderRadius: '8px', color: '#64748b', fontSize: '0.9rem', fontWeight: '500' },
  
  // ESTILOS DE REVISIÓN
  audioPlayerContainer: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '15px', marginBottom: '20px', textAlign: 'left' },
  audioPlayerTitle: { margin: '0 0 8px 0', color: '#475569', fontSize: '0.9rem', fontWeight: '600' },
  audioElement: { width: '100%' },
  btnVolver: { background: '#64748b', color: '#fff', border: 'none', padding: '14px 20px', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '600', flex: 1 },
  btnConfirmar: { background: '#2563eb', color: '#fff', border: 'none', padding: '14px 20px', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '600', flex: 1 },
  instructionsBox: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '16px 20px',
    textAlign: 'left',
    marginBottom: '20px'
  },

  instructionsTitle: {
    margin: '0 0 10px 0',
    color: '#1e293b',
    fontSize: '1rem',
    fontWeight: '700'
  },

  instructionsList: {
    margin: 0,
    paddingLeft: '20px',
    color: '#475569',
    fontSize: '0.9rem',
    lineHeight: '1.6'
  },

  formGroup: {
    textAlign: 'left',
    marginBottom: '22px'
  },

  label: {
    display: 'block',
    color: '#334155',
    fontSize: '0.95rem',
    fontWeight: '600',
    marginBottom: '8px'
  },

  select: {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid #cbd5e1',
    fontSize: '0.95rem',
    background: '#ffffff',
    color: '#1e293b'
  },

  helperText: {
    color: '#64748b',
    fontSize: '0.82rem',
    lineHeight: '1.4',
    marginTop: '8px'
  }
};