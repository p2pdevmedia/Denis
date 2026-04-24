import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  CircleMarker,
  Popup,
  TileLayer,
  useMap
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

const KML_URL = "/PROPIEDADESVENTA.kml";
const officeWhatsApp = "5492944688613";

const CATEGORY_META = {
  venta: {
    label: "En venta",
    color: "#a65774",
    mapColor: "#a65774"
  },
  alquiler_turistico: {
    label: "Alquiler turistico",
    color: "#e45858",
    mapColor: "#e45858"
  },
  vendido: {
    label: "Vendido",
    color: "#161616",
    mapColor: "#161616"
  },
  proceso: {
    label: "En proceso / sin precio",
    color: "#c9a227",
    mapColor: "#c9a227"
  }
};

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function htmlToText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || "", "text/html");
  const text = doc.body.innerText || doc.body.textContent || "";
  return text.replace(/\s+/g, " ").trim();
}

function truncateText(text, maxLength = 180) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function extractPrice(text) {
  const normalizeCurrency = (value) =>
    value
      .replace(/U\$S/gi, "USD")
      .replace(/U\$D/gi, "USD")
      .replace(/u\$s/gi, "USD")
      .replace(/u\$d/gi, "USD")
      .replace(/\s+/g, " ")
      .trim();

  const pricePatterns = [
    /(?:U\$D|USD|U\$S)\s*[0-9][0-9.,]*(?:\s*(?:mil|millones?))?/i,
    /valor[:\s]*((?:U\$D|USD|U\$S)\s*[0-9][0-9.,]*(?:\s*(?:mil|millones?))?)/i
  ];

  for (const pattern of pricePatterns) {
    const match = text.match(pattern);
    if (match) {
      return normalizeCurrency(match[1] || match[0]);
    }
  }

  const fallback = text.match(/\b(?:U\$D|USD|U\$S)\b[\s:]*[0-9][0-9.,]*(?:\s*(?:mil|millones?))?/i);
  return fallback ? normalizeCurrency(fallback[0]) : "Consultar";
}

function extractArea(text) {
  const patterns = [
    /\b[0-9][0-9.,]*\s?(?:m²|m2)\b(?:\s*cubiertos?)?/i,
    /\b[0-9][0-9.,]*\s?ha\b/i,
    /\b[0-9][0-9.,]*\s?hect[aá]reas?\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].replace(/\s+/g, " ").trim();
  }

  return "Superficie a confirmar";
}

function extractLocation(text, title) {
  const locationMatch = text.match(
    /Ubicaci[oó]n:\s*(.*?)(?=\s*(?:Superficie|Servicios|Caracter[ií]sticas|Valor|Frente|Distribuci[oó]n|Acceso|Amenities|Usos|FOS|FOT|Opcion|Opción|Capacidad|Terreno|Lote|Casa|Departamento|$))/i
  );
  if (locationMatch) {
    return locationMatch[1].replace(/\s+/g, " ").trim();
  }

  if (/miralejos/i.test(title)) return "Estancia Miralejos, San Martin de los Andes";
  if (/kaleuche/i.test(title)) return "Kaleuche, San Martin de los Andes";
  if (/vega/i.test(title)) return "Vega Maipu, San Martin de los Andes";

  return "San Martin de los Andes, Neuquen";
}

function buildCategory(text, styleColor) {
  if (styleColor === "ef5350") {
    return "alquiler_turistico";
  }

  if (styleColor === "000000") {
    return "vendido";
  }

  if (styleColor === "ab47bc") {
    return "venta";
  }

  if (styleColor === "ffee58") {
    return "proceso";
  }

  if (/tur[ií]stic|temporada|pax/i.test(text)) {
    return "alquiler_turistico";
  }

  if (/no se vende/i.test(text) || /ya se vend/i.test(text)) {
    return "vendido";
  }

  if (/antes del .*ingresa a la venta/i.test(text) || /valor cerrado/i.test(text)) {
    return "proceso";
  }

  return "venta";
}

function formatCoords(coords) {
  const [lat, lng] = coords;
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

function parseKml(kmlText) {
  const styleColorMap = {};
  for (const match of kmlText.matchAll(
    /<gx:CascadingStyle kml:id="(__managed_style_[^"]+)_normal">[\s\S]*?<href>https:\/\/earth\.google\.com\/earth\/document\/icon\?color=([a-z0-9]+)/gi
  )) {
    const styleId = match[1];
    const color = match[2].toLowerCase();
    styleColorMap[styleId] = color;
  }

  const parser = new DOMParser();
  const xml = parser.parseFromString(kmlText, "application/xml");

  const placemarks = [...xml.querySelectorAll("Placemark")];

  return placemarks
    .map((placemark, index) => {
      const name = placemark.querySelector("name")?.textContent?.trim() || `Propiedad ${index + 1}`;
      const descriptionHtml = placemark.querySelector("description")?.textContent?.trim() || "";
      const coordinatesText = placemark.querySelector("coordinates")?.textContent?.trim() || "";
      const styleUrl = placemark.querySelector("styleUrl")?.textContent?.trim() || "";
      const styleColor = styleColorMap[styleUrl.replace(/^#/, "")] || "";
      const [lngText, latText] = coordinatesText.split(",");
      const lat = Number.parseFloat(latText);
      const lng = Number.parseFloat(lngText);
      const plainText = htmlToText(descriptionHtml);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }

      return {
        id: `${slugify(name)}-${index + 1}`,
        title: name,
        location: extractLocation(plainText, name),
        price: extractPrice(plainText),
        area: extractArea(plainText),
        category: buildCategory(plainText, styleColor),
        styleColor,
        coords: [lat, lng],
        descriptionHtml,
        summary: truncateText(plainText, 210),
        rawDescription: plainText
      };
    })
    .filter(Boolean);
}

function MapFocus({ coords }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo(coords, 13, { duration: 1.1 });
  }, [coords, map]);

  return null;
}

function App() {
  const [properties, setProperties] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const mapSectionRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function loadKml() {
      try {
        const response = await fetch(KML_URL);
        const text = await response.text();
        const parsed = parseKml(text);

        if (!active) return;

        setProperties(parsed);
        setSelectedId(parsed[0]?.id || "");
      } catch (error) {
        if (!active) return;
        setProperties([]);
        setSelectedId("");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadKml();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!properties.length) return;
    const currentExists = properties.some((property) => property.id === selectedId);
    if (!currentExists) {
      setSelectedId(properties[0].id);
    }
  }, [properties, selectedId]);

  const visibleProperties = properties.filter((property) =>
    property.category === "venta" || property.category === "alquiler_turistico"
  );

  useEffect(() => {
    if (!visibleProperties.length) return;
    const currentVisible = visibleProperties.some((property) => property.id === selectedId);
    if (!currentVisible) {
      setSelectedId(visibleProperties[0].id);
    }
  }, [visibleProperties, selectedId]);

  const selectedProperty =
    visibleProperties.find((property) => property.id === selectedId) || visibleProperties[0] || null;

  const formatDisplayedPrice = (property) =>
    property?.category === "proceso" ? "Sin precio" : property?.price || "Consultar";

  const focusPropertyOnMap = (property) => {
    setSelectedId(property.id);
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const createWhatsAppLink = (property) => {
    const message = `Hola Denise, quiero informacion sobre: ${property.title} (${property.price}) en ${property.location}.`;
    return `https://wa.me/${officeWhatsApp}?text=${encodeURIComponent(message)}`;
  };

  return (
    <div className="page-shell">
      <header className="hero" id="inicio">
        <nav className="top-nav">
          <p className="brand">Denise Catalan Bienes Raices</p>
          <div className="links">
            <a href="#propiedades">Propiedades</a>
            <a href="#mapa">Mapa</a>
            <a href="#contacto">WhatsApp</a>
          </div>
        </nav>

        <div className="hero-content">
          <p className="overline">
            {loading
              ? "Cargando archivo KML..."
              : `${visibleProperties.length} propiedades visibles`}
          </p>
          <h1>Propiedades reales en San Martin de los Andes, Patagonia.</h1>
          <p>
            Datos leidos desde <strong>PROPIEDADESVENTA.kml</strong> para mostrar ubicacion, precio y descripcion completa.
          </p>
          <p className="contact-line">
            WhatsApp: <strong>+54 9 2944 68-8613</strong>
          </p>
          <div className="legend">
            {["venta", "alquiler_turistico"].map((key) => {
              const meta = CATEGORY_META[key];
              return (
                <span key={key} className={`legend-pill legend-pill--${key}`}>
                  {meta.label}
                </span>
              );
            })}
          </div>
          <a className="cta" href="#propiedades">
            Explorar propiedades
          </a>
        </div>
      </header>

      <main className="content-wrap">
        <section className="properties" id="propiedades">
          <div className="section-title">
            <p>Coleccion real</p>
            <h2>Propiedades desde el KML</h2>
          </div>

          {loading ? (
            <p className="loading-state">Leyendo las propiedades reales...</p>
          ) : (
            <div className="property-grid">
              {visibleProperties.map((property) => (
                <article
                  className={`property-card ${property.id === selectedProperty?.id ? "active" : ""}`}
                  key={property.id}
                >
                  <div className="property-cover">
                    <p className={`status-pill status-pill--${property.category}`}>
                      {CATEGORY_META[property.category]?.label || "En venta"}
                    </p>
                    <h3>{property.title}</h3>
                    <p className="cover-location">{property.location}</p>
                    <div className="cover-metrics">
                      <div>
                        <span>Precio</span>
                        <strong>{formatDisplayedPrice(property)}</strong>
                      </div>
                      <div>
                        <span>Superficie</span>
                        <strong>{property.area}</strong>
                      </div>
                      <div>
                        <span>Geo</span>
                        <strong>{formatCoords(property.coords)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="property-body">
                    <p className="meta">Cargado desde el KML</p>
                    <p className="summary">{property.summary}</p>
                    <div className="card-actions">
                      <button
                        type="button"
                        onClick={() => focusPropertyOnMap(property)}
                        className="map-btn"
                      >
                        Ver en mapa
                      </button>
                      <a
                        href={createWhatsAppLink(property)}
                        target="_blank"
                        rel="noreferrer"
                        className="wa-btn"
                      >
                        Contactar por WhatsApp
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="map-section" id="mapa" ref={mapSectionRef}>
          <div className="section-title">
            <p>Geolocalizacion</p>
            <h2>Mapa de ubicaciones</h2>
          </div>

          <div className="map-layout">
            <div className="map-frame">
              {selectedProperty ? (
                <MapContainer
                  center={selectedProperty.coords}
                  zoom={12}
                  scrollWheelZoom={true}
                  className="map-view"
                >
                  <MapFocus coords={selectedProperty.coords} />
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {visibleProperties.map((property) => (
                    <CircleMarker
                      key={property.id}
                      center={property.coords}
                      radius={property.id === selectedProperty.id ? 11 : 8}
                      pathOptions={{
                        color: CATEGORY_META[property.category]?.mapColor || "#a65774",
                        fillColor: CATEGORY_META[property.category]?.mapColor || "#a65774",
                        fillOpacity: 0.9,
                        weight: property.id === selectedProperty.id ? 4 : 2
                      }}
                      eventHandlers={{
                        click: () => setSelectedId(property.id)
                      }}
                    >
                      <Popup>
                        <strong>{property.title}</strong>
                        <br />
                        {property.price}
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              ) : (
                <div className="map-empty">
                  <p>No hay propiedades cargadas todavia.</p>
                </div>
              )}
            </div>

            <aside className="map-highlight details-panel" id="contacto">
              <p className="chip">Ficha completa</p>
              <h3>{selectedProperty?.title || "Selecciona una propiedad"}</h3>
              <p>{selectedProperty?.location}</p>
              <p className={`status-pill status-pill--${selectedProperty?.category || "venta"}`}>
                {selectedProperty ? CATEGORY_META[selectedProperty.category]?.label : "En venta"}
              </p>
              <div className="detail-stats">
                <div>
                  <span>Precio</span>
                  <strong>{formatDisplayedPrice(selectedProperty)}</strong>
                </div>
                <div>
                  <span>Superficie</span>
                  <strong>{selectedProperty?.area}</strong>
                </div>
                <div>
                  <span>Geo</span>
                  <strong>{selectedProperty ? formatCoords(selectedProperty.coords) : "-"}</strong>
                </div>
              </div>
              <div
                className="rich-text"
                dangerouslySetInnerHTML={{
                  __html: selectedProperty?.descriptionHtml || "<p>Sin descripcion disponible.</p>"
                }}
              />
              {selectedProperty ? (
                <a
                  href={createWhatsAppLink(selectedProperty)}
                  target="_blank"
                  rel="noreferrer"
                  className="wa-btn"
                >
                  Hablar por WhatsApp
                </a>
              ) : null}
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
