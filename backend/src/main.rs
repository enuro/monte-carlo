mod api;
mod image_processing;
mod parser;
mod rng;
mod shapes;

use actix_cors::Cors;
use actix_web::{App, HttpServer};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let port: u16 = std::env::var("BACKEND_PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .unwrap_or(8080);

    println!("Сервер запущен: http://127.0.0.1:{}", port);

    HttpServer::new(|| {
        App::new()
            .wrap(Cors::permissive())
            .service(api::calculate)
            .service(api::calculate_image)
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
