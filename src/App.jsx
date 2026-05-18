import React, { useState, useRef, useEffect } from 'react';
import { db, storage } from './firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

export default function App() {
  const [fase, setFase] = useState(1); // Fases: 1, 2, 3, y 4 (Pantalla Final)
  const [consentimiento, setConsentimiento] = useState(() => {
    return localStorage.getItem('recolector_completado') === 'true' || localStorage.getItem('recolector_consentimiento') === 'true';
  });
  const [yaParticipo, setYaParticipo] = useState(() => {
    return localStorage.getItem('recolector_completado') === 'true';
  });

  const [userId] = useState(() => {
    const guardado = localStorage.getItem('recolector_user_id');
    if (guardado) return guardado;
    const nuevoId = 'user_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('recolector_user_id', nuevoId);
    return nuevoId;
  });

  const [grabando, setGrabando] = useState(false);
  const [tiempo, setTiempo] = useState(0);
  const [texto, setTexto] = useState('Cargando texto...');
  const [subiendo, setSubiendo] = useState(false);
  const [estadoEnvio, setEstadoEnvio] = useState(''); // '', 'subiendo', 'exito', 'error'
  const [bloquearSiguiente, setBloquearSiguiente] = useState(true);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const textoFijo = "El viento del norte y el sol disputaban sobre cuál de ellos era el más fuerte, cuando vio acercarse a un viajero envuelto en una capa. Acordaron que el primero que lograra que el viajero se quitara la capa sería considerado más poderoso. El viento del norte sopló con gran furia, pero cuanto más soplaba, más se envolvía el viajero en su capa. Al fin, el viento desistió. Entonces el sol brilló con todo su esplendor e inmediatamente el viajero se quitó la capa.\n\nPor otra parte, un cuervo sediento volaba bajo el cielo caluroso buscando un poco de agua. Encontró una jarra en el fondo de un jardín, pero el nivel del agua era tan bajo que su pico no alcanzaba a tocarla. Lejos de rendirse, el ave comenzó a recoger piedras pequeñas con su pico y las fue arrojando una a una dentro del recipiente. Con cada piedra, el agua subía un poco más, hasta que finalmente llegó al borde y el cuervo pudo calmar su sed, demostrando que la paciencia y el ingenio vencen a la fuerza.";
  
  const preguntasLibres = [
    "Cuéntame detalladamente qué hiciste desde que te levantaste hoy hasta este momento.",
    "Describe tu película o libro favorito como si se lo estuvieras recomendando a un amigo, pero sin decir el final.",
    "Si pudieras viajar a cualquier parte del mundo mañana mismo con todo pagado, ¿a dónde irías y qué harías allí?",
    "Explícame cómo se prepara tu platillo de comida favorito paso a paso.",
    "¿Cuál es el recuerdo más divertido o feliz que tienes de tu infancia?"
  ];

  const textoLecturaOpcional = "El estudio de las ondas sonoras y la acústica aplicada ha permitido descifrar los patrones mecánicos que componen el habla humana. Cada individuo posee una firma acústica única determinada por la fisiología de sus cuerdas vocales, la cavidad nasal y los hábitos de articulación. Este registro busca almacenar de forma puramente matemática dichos espectros de frecuencia con el fin de alimentar modelos de reconocimiento de patrones fonéticos sin invadir la identidad personal.";

  useEffect(() => {
    if (yaParticipo) {
      setFase(4);
      return;
    }
    
    setTiempo(0);
    setBloquearSiguiente(true);
    setEstadoEnvio('');
    
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
          if (prev >= 60) {
            detenerGrabacion();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [grabando]);

  const obtenerTextoWikipedia = async () => {
    try {
      const res = await fetch("https://es.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&generator=random&exchars=800&exintro=1&explaintext=1&grnnamespace=0&origin=*");
      const data = await res.json();
      const pages = data.query.pages;
      const extract = pages[Object.keys(pages)[0]].extract;

      if (!extract || extract.length < 300) {
        return obtenerTextoWikipedia();
      }
      setTexto(extract);
    } catch (err) {
      setTexto("La inteligencia artificial y el procesamiento de señales de audio digital han revolucionado las industrias modernas. A través del análisis espectrográfico, los investigadores pueden aislar ruido ambiental y segmentar locutores eficazmente.");
    }
  };

  const cambiarATextoLectura = () => {
    setTexto(`Opción de lectura alternativa (Fase 3):\n\n${textoLecturaOpcional}`);
  };

  const iniciarGrabacion = async () => {
    audioChunksRef.current = [];
    setEstadoEnvio('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (tiempo < 4) {
          setEstadoEnvio('error');
          alert("La grabación es demasiado corta. Intenta hablar al menos 5 segundos.");
          return;
        }
        await subirAFirebase(audioBlob);
      };

      mediaRecorderRef.current.start();
      setGrabando(true);
    } catch (err) {
      alert("Permiso de micrófono denegado.");
    }
  };

  const detenerGrabacion = () => {
    if (mediaRecorderRef.current && grabando) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setGrabando(false);
    }
  };

  const subirAFirebase = async (blob) => {
    setSubiendo(true);
    setEstadoEnvio('subiendo');
    const rutaArchivo = `audios/${userId}/fase_${fase}_${Date.now()}.webm`;
    const storageRef = ref(storage, rutaArchivo);

    try {
      await uploadBytes(storageRef, blob);
      await addDoc(collection(db, "grabaciones"), {
        userId: userId,
        fase: fase,
        textoAsociado: texto,
        audioPath: rutaArchivo,
        duracionSegundos: tiempo,
        fecha: new Date().toISOString()
      });

      setSubiendo(false);
      setEstadoEnvio('exito');
      setBloquearSiguiente(false);
    } catch (error) {
      console.error("Error:", error);
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
    localStorage.setItem('recolector_consentimiento', 'true');
    setConsentimiento(true);
  };

  // VISTA 1: CONTROL DE PARTICIPANTE DUPLICADO O YA COMPLETADO
  if (yaParticipo || fase === 4) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.successIcon}>🎉</div>
          <h1 style={styles.tituloPrincipal}>¡Misión Cumplida!</h1>
          <p style={styles.parrafo}>
            Tu participación ha sido registrada con éxito en el búnker seguro de datos. Tus tres segmentos de voz ya forman parte del dataset de investigación.
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

  // VISTA 2: CONSENTIMIENTO INFORMADO
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
              Las muestras obtenidas formarán parte de un corpus abierto de investigación científica. <strong>Está estrictamente prohibido el uso de estos archivos para clonación artificial de voz o suplantación biométrica.</strong> Tu identidad permanece anónima.
            </p>
          </div>

          <button onClick={aceptarConsentimiento} style={styles.btnAceptar}>
            Acepto las condiciones y deseo empezar
          </button>
        </div>
      </div>
    );
  }

  // VISTA 3: EL FLUJO COMPLETO (PASOS 1, 2 Y 3)
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        
        {/* COMPONENTE: LÍNEA DE TIEMPO / PROGRESO */}
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
          {formatearTiempo(tiempo)} <span style={{fontSize: '1.1rem', color: '#95a5a6'}}> / 01:00</span>
        </div>

        <p style={{ color: '#475569', fontSize: '0.95rem', fontWeight: '600', marginBottom: '10px', textAlign: 'left' }}>
          {fase === 1 && "📋 Instrucción: Lee el siguiente texto completo de forma clara, pausada y a un ritmo natural:"}
          {fase === 2 && "📋 Instrucción: Lee el fragmento de Wikipedia de corrido hasta que decidas detener la grabación:"}
          {fase === 3 && "📋 Instrucción: Responde a la pregunta de forma espontánea o lee el texto alternativo si lo prefieres:"}
        </p>

        <div style={styles.cajaTexto}>
          {texto}
        </div>

        {/* Botón de escape para la Fase 3 */}
        {fase === 3 && !grabando && estadoEnvio !== 'exito' && (
          <button onClick={cambiarATextoLectura} style={styles.btnAlternativo}>
            📖 Prefiero leer un texto en lugar de responder
          </button>
        )}

        {/* FEEDBACK FEED VISUAL (Reemplazo de los Alerts de navegador) */}
        <div style={styles.statusView}>
          {estadoEnvio === 'subiendo' && <div style={styles.loaderText}>⏳ Sincronizando audio con el búnker...</div>}
          {estadoEnvio === 'exito' && <div style={styles.successText}>✔ ¡Audio asegurado con éxito! Puedes avanzar al siguiente paso.</div>}
          {estadoEnvio === 'error' && <div style={styles.errorText}>❌ Error en la conexión. Vuelve a intentar el segmento.</div>}
        </div>

        <div style={styles.contenedorBotones}>
          {!grabando ? (
            <button onClick={iniciarGrabacion} disabled={subiendo || estadoEnvio === 'exito'} style={{...styles.btnGrabar, opacity: (subiendo || estadoEnvio === 'exito') ? 0.5 : 1, cursor: (subiendo || estadoEnvio === 'exito') ? 'not-allowed' : 'pointer'}}>
              🎙️ Grabar este segmento
            </button>
          ) : (
            <button onClick={detenerGrabacion} style={styles.btnDetener}>
              ⏹️ Detener y Enviar
            </button>
          )}

          <button 
            onClick={avanzarFase} 
            disabled={bloquearSiguiente || grabando} 
            style={{ 
              ...styles.btnSiguiente, 
              background: fase === 3 ? '#9b59b6' : '#3498db',
              cursor: (bloquearSiguiente || grabando) ? 'not-allowed' : 'pointer', 
              opacity: (bloquearSiguiente || grabando) ? 0.3 : 1 
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
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: '#f8f9fa',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px'
  },
  card: {
    background: '#ffffff',
    maxWidth: '600px',
    width: '100%',
    padding: '35px',
    borderRadius: '20px',
    boxShadow: '0 15px 35px rgba(0,0,0,0.03)',
    textAlign: 'center',
    border: '1px solid #eef2f5'
  },
  tituloPrincipal: {
    color: '#1e293b',
    fontSize: '1.7rem',
    marginBottom: '15px',
    fontWeight: '700'
  },
  parrafo: {
    color: '#64748b',
    fontSize: '1rem',
    lineHeight: '1.6',
    marginBottom: '20px'
  },
  alertBox: {
    background: '#fffbeb',
    borderLeft: '4px solid #f59e0b',
    padding: '15px 20px',
    borderRadius: '10px',
    textAlign: 'left',
    marginBottom: '25px'
  },
  alertTitle: {
    margin: '0 0 6px 0',
    color: '#b45309',
    fontSize: '1rem',
    fontWeight: '600'
  },
  alertText: {
    margin: 0,
    color: '#78350f',
    fontSize: '0.9rem',
    lineHeight: '1.5'
  },
  btnAceptar: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    padding: '14px',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    width: '100%'
  },
  timelineContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '30px',
    padding: '0 10px'
  },
  timelineStep: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    color: '#cbd5e1',
    flex: 1
  },
  stepActive: {
    color: '#2563eb'
  },
  stepNumber: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'currentColor',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '0.9rem',
    marginBottom: '6px'
  },
  stepLabel: {
    fontSize: '0.8rem',
    fontWeight: '600',
    color: '#64748b'
  },
  timelineLine: {
    height: '2px',
    background: '#e2e8f0',
    flex: '1',
    marginPosition: 'relative',
    top: '-10px',
    margin: '0 10px',
    maxWidth: '70px'
  },
  metaHeader: {
    textAlign: 'right',
    marginBottom: '10px'
  },
  userIdText: {
    color: '#94a3b8',
    fontSize: '0.8rem',
    fontFamily: 'monospace'
  },
  cronometro: {
    fontSize: '2.5rem',
    fontWeight: '800',
    marginBottom: '15px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
  },
  cajaTexto: {
    whiteSpace: 'pre-line',
    textAlign: 'justify',
    background: '#f1f5f9',
    padding: '22px',
    borderRadius: '12px',
    lineHeight: '1.65',
    fontSize: '1.05rem',
    color: '#334155',
    marginBottom: '20px',
    border: '1px solid #e2e8f0',
    minHeight: '100px'
  },
  btnAlternativo: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
    marginBottom: '20px',
    textDecoration: 'underline'
  },
  statusView: {
    minHeight: '30px',
    marginBottom: '20px',
    fontSize: '0.9rem',
    fontWeight: '500'
  },
  loaderText: { color: '#d97706' },
  successText: { color: '#16a34a' },
  errorText: { color: '#dc2626' },
  contenedorBotones: {
    display: 'flex',
    gap: '15px'
  },
  btnGrabar: {
    background: '#10b981',
    color: '#fff',
    border: 'none',
    padding: '14px 20px',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: '600',
    flex: 1
  },
  btnDetener: {
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    padding: '14px 20px',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: '600',
    flex: 1
  },
  btnSiguiente: {
    color: '#fff',
    border: 'none',
    padding: '14px 20px',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: '600',
    flex: 1
  },
  successIcon: {
    fontSize: '4rem',
    marginBottom: '15px'
  },
  lockBadge: {
    background: '#f8f9fa',
    border: '1px dashed #cbd5e1',
    padding: '12px',
    borderRadius: '8px',
    color: '#64748b',
    fontSize: '0.9rem',
    fontWeight: '500'
  }
};