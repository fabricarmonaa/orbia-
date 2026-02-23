import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";

export default function Terms() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Navigation />
      
      <main className="pt-32 pb-24 container mx-auto px-4 max-w-4xl">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Términos y Condiciones</h1>
        <p className="text-slate-500 mb-12">Última actualización: Octubre 2024</p>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12 prose prose-slate max-w-none">
          <h3>1. Aceptación de los términos</h3>
          <p>Al acceder y utilizar el sistema ORBIA, usted acepta estar sujeto a estos términos y condiciones. Si no está de acuerdo con alguna parte de estos términos, no podrá utilizar nuestros servicios.</p>

          <h3>2. Descripción del servicio</h3>
          <p>ORBIA es una plataforma de gestión empresarial en la nube que proporciona herramientas para el control de ventas, inventario, caja y administración de negocios.</p>

          <h3>3. Alcance del servicio</h3>
          <p>El servicio se proporciona "tal cual". ORBIA no brinda asesoramiento contable, fiscal o legal. El usuario es responsable de verificar que el uso del sistema cumpla con sus obligaciones legales y fiscales locales.</p>

          <h3>4. Responsabilidad del usuario</h3>
          <p>El usuario se compromete a proporcionar información real y mantener la confidencialidad de sus credenciales de acceso. Cualquier actividad realizada desde su cuenta es de su exclusiva responsabilidad.</p>

          <h3>5. Disponibilidad del servicio</h3>
          <p>Nos esforzamos por mantener el servicio disponible el 99.9% del tiempo. Sin embargo, pueden ocurrir interrupciones por mantenimiento programado o causas de fuerza mayor. No garantizamos la disponibilidad ininterrumpida.</p>

          <h3>6. Limitación de responsabilidad</h3>
          <p>ORBIA no será responsable por lucro cesante, pérdida de datos, interrupciones de conectividad o acciones de terceros que afecten el servicio.</p>

          <h3>7. Protección de datos</h3>
          <p>Los datos ingresados en el sistema son propiedad del usuario. ORBIA utiliza esta información únicamente para fines operativos y de mejora del servicio, y no comercializará sus datos con terceros.</p>

          <h3>8. Pagos y facturación</h3>
          <p>Los servicios se abonan por adelantado según el plan seleccionado. La falta de pago puede resultar en la suspensión temporal o definitiva del servicio.</p>

          <h3>9. Cancelación</h3>
          <p>El usuario puede cancelar el servicio en cualquier momento. No se realizarán reembolsos por períodos no utilizados, pero se mantendrá el acceso hasta el final del ciclo de facturación vigente.</p>

          <h3>10. Modificaciones</h3>
          <p>Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios significativos serán notificados a los usuarios activos.</p>

          <h3>11. Propiedad intelectual</h3>
          <p>Todo el código, diseño, logotipos y funcionalidades de ORBIA son propiedad intelectual exclusiva de la empresa y están protegidos por leyes de derechos de autor.</p>

          <h3>12. Resguardo de información y Disclaimer</h3>
          <p>Si bien realizamos copias de seguridad periódicas, recomendamos al usuario mantener sus propios respaldos de información crítica. El uso del sistema es bajo su propio riesgo.</p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
