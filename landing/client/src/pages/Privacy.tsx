import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Navigation />
      
      <main className="pt-32 pb-24 container mx-auto px-4 max-w-4xl">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Política de Privacidad</h1>
        <p className="text-slate-500 mb-12">Su privacidad es importante para nosotros.</p>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12 prose prose-slate max-w-none">
          <h3>1. Introducción</h3>
          <p>En ORBIA nos comprometemos a proteger su privacidad y sus datos personales. Esta política explica cómo recopilamos, usamos y protegemos su información.</p>

          <h3>2. Información que recopilamos</h3>
          <p>Recopilamos datos de registro (nombre, email, teléfono), datos comerciales (productos, ventas, clientes) necesarios para el funcionamiento del sistema, y datos técnicos de acceso y uso.</p>

          <h3>3. Finalidad del uso</h3>
          <p>Utilizamos su información para brindar el servicio contratado, ofrecer soporte técnico, mejorar la seguridad de la plataforma y comunicarnos sobre actualizaciones o novedades.</p>

          <h3>4. Almacenamiento y seguridad</h3>
          <p>Implementamos medidas de seguridad técnicas y organizativas para proteger sus datos contra acceso no autorizado, pérdida o alteración. Utilizamos servidores seguros y encriptación estándar de la industria.</p>

          <h3>5. Responsabilidad sobre datos cargados</h3>
          <p>El usuario es responsable de los datos personales de terceros (sus clientes o empleados) que cargue en la plataforma, debiendo contar con la autorización correspondiente para ello.</p>

          <h3>6. Cesión de datos</h3>
          <p>No vendemos ni alquilamos su información personal. Solo compartiremos datos cuando sea estrictamente necesario para la infraestructura del servicio (ej. alojamiento en la nube) o por requerimiento legal.</p>

          <h3>7. Conservación de la información</h3>
          <p>Mantendremos su información mientras su cuenta esté activa o sea necesario para prestarle servicios. Si cierra su cuenta, podemos conservar ciertos datos para cumplir con obligaciones legales.</p>

          <h3>8. Derechos del usuario</h3>
          <p>Usted tiene derecho a acceder, corregir, eliminar o limitar el uso de sus datos personales. Puede ejercer estos derechos contactando a nuestro equipo de soporte.</p>

          <h3>9. Uso de inteligencia artificial</h3>
          <p>Ciertas funciones de ORBIA pueden utilizar modelos de IA para procesamiento de texto o voz. Estos datos se procesan de forma anonimizada y con el único fin de ejecutar la función solicitada.</p>

          <h3>10. Modificaciones</h3>
          <p>Podemos actualizar esta política de privacidad ocasionalmente. Le notificaremos cualquier cambio material a través de la plataforma o por correo electrónico.</p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
