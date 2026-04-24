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

function BrandLogo() {
  return (
    <a className="brand-link" href="#inicio" aria-label="Ir al inicio">
      <img className="brand-logo" src="/negro.png" alt="Denise Catalan Bienes Raices" />
    </a>
  );
}

function WhatsAppIcon() {
  return (
    <svg
      className="wa-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M20.5 11.9a8.5 8.5 0 0 1-12.9 7.3L4 20l.9-3.5A8.5 8.5 0 1 1 20.5 11.9Zm-8.5-6.9a6.9 6.9 0 0 0-5.8 10.6l.1.2-.6 2.3 2.4-.6.2.1a6.9 6.9 0 1 0 3.7-12.6Zm4 9.8c-.2.6-1 1-1.5 1.1-.4.1-1 .1-1.7-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.2-.3-1.2-1.5-1.2-2.8 0-1.3.7-2 1-2.2.3-.2.6-.3.8-.3h.6c.2 0 .4 0 .5.3l.7 1.7c.1.3.2.6 0 .8l-.4.5c-.1.2-.3.4-.1.7.2.3.8 1.4 1.8 2.2 1.3 1.1 2.3 1.4 2.6 1.5.3.1.5.1.7-.1l.8-.9c.2-.2.4-.2.6-.1l1.7.8c.2.1.4.2.4.4.1.2.1.8-.1 1.4Z"
      />
    </svg>
  );
}

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

function htmlToLines(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || "", "text/html");
  const blockTags = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li"]);
  const blocks = [];

  const addBlock = (value) => {
    const text = value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (text) {
      blocks.push(text);
    }
  };

  const walk = (node) => {
    for (const child of node.children || []) {
      const tag = child.tagName.toLowerCase();

      if (tag === "script" || tag === "style") {
        continue;
      }

      if (tag === "ul" || tag === "ol") {
        for (const li of child.children) {
          addBlock(li.textContent || "");
        }
        continue;
      }

      if (blockTags.has(tag)) {
        const nestedBlock = child.querySelector("p, div, h1, h2, h3, h4, h5, h6, li, ul, ol");
        if (nestedBlock && nestedBlock !== child) {
          walk(child);
        } else {
          addBlock(child.textContent || "");
        }
        continue;
      }

      walk(child);
    }
  };

  walk(doc.body);
  return blocks;
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
      const descriptionLines = htmlToLines(descriptionHtml);

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
        descriptionLines,
        summary: truncateText(descriptionLines.join(" "), 210) || truncateText(plainText, 210),
        rawDescription: plainText
      };
    })
    .filter(Boolean);
}

function MapFocus({ coords, zoom = 13 }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo(coords, zoom, { duration: 1.1 });
  }, [coords, map, zoom]);

  return null;
}

function getRouteFromHash(hash) {
  const value = (hash || "").replace(/^#/, "");
  if (value.startsWith("/propiedad/")) {
    return { page: "property", propertyId: value.replace("/propiedad/", "") };
  }

  return { page: "home" };
}

function PropertyMap({ properties, selectedProperty, onSelect, zoom = 12, emptyLabel = "No hay propiedades cargadas todavia." }) {
  if (!selectedProperty) {
    return (
      <div className="map-empty">
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <MapContainer
      center={selectedProperty.coords}
      zoom={zoom}
      scrollWheelZoom={true}
      className="map-view"
    >
      <MapFocus coords={selectedProperty.coords} zoom={zoom} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {properties.map((property) => (
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
            click: () => onSelect(property)
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
  );
}

function PropertyGallery({ property }) {
  const galleryItems = property?.photos || property?.gallery || [];

  if (galleryItems.length) {
    return (
      <div className="gallery-grid">
        <div className="gallery-hero">
          <img src={galleryItems[0]} alt={property.title} />
        </div>
        <div className="gallery-thumbs">
          {galleryItems.slice(1, 4).map((src, index) => (
            <img key={`${property.id}-photo-${index}`} src={src} alt={`${property.title} ${index + 2}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="gallery-empty">
      <div className="gallery-empty__main">
        <p className="chip">Galería preparada</p>
        <h3>No hay fotos cargadas todavía</h3>
        <p>
          La ficha ya queda lista para recibir fotos reales de esta propiedad. Cuando me pases
          los enlaces o archivos, las conectamos acá sin cambiar el resto del sitio.
        </p>
      </div>
      <div className="gallery-empty__tiles" aria-hidden="true">
        <div className="gallery-tile gallery-tile--large">
          <span>Foto principal</span>
        </div>
        <div className="gallery-tile">
          <span>Foto 2</span>
        </div>
        <div className="gallery-tile">
          <span>Foto 3</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [properties, setProperties] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState(() => getRouteFromHash(window.location.hash));
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
    const handleHashChange = () => setRoute(getRouteFromHash(window.location.hash));
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    return () => window.removeEventListener("hashchange", handleHashChange);
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

  const detailProperty =
    route.page === "property"
      ? visibleProperties.find((property) => property.id === route.propertyId) || null
      : null;

  useEffect(() => {
    if (!visibleProperties.length) return;
    const currentVisible = visibleProperties.some((property) => property.id === selectedId);
    if (!currentVisible) {
      setSelectedId(visibleProperties[0].id);
    }
  }, [visibleProperties, selectedId]);

  const selectedProperty =
    detailProperty ||
    visibleProperties.find((property) => property.id === selectedId) ||
    visibleProperties[0] ||
    null;

  const formatDisplayedPrice = (property) =>
    property?.category === "proceso" ? "Sin precio" : property?.price || "Consultar";

  const openPropertyPage = (property) => {
    window.location.hash = `#/propiedad/${property.id}`;
  };

  const backToListing = () => {
    window.location.hash = "#propiedades";
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const focusPropertyOnMap = (property) => {
    if (route.page === "property") {
      document.getElementById("mapa-detalle")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    setSelectedId(property.id);
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const createWhatsAppLink = (property) => {
    const message = [
      "Hola Denise, vi esta propiedad en tu web y quiero más información.",
      `Propiedad: ${property.title}`,
      `Ubicación: ${property.location}`,
      `Precio: ${property.price}`,
      `Superficie: ${property.area}`,
      "Si te parece, coordinamos una visita."
    ].join("\n");
    return `https://wa.me/${officeWhatsApp}?text=${encodeURIComponent(message)}`;
  };

  if (route.page === "property" && detailProperty) {
    return (
      <div className="page-shell page-shell--detail">
        <header className="detail-hero">
          <nav className="top-nav">
            <BrandLogo />
            <div className="links">
              <button type="button" className="nav-link-button" onClick={backToListing}>
                Volver al listado
              </button>
              <a href={createWhatsAppLink(detailProperty)}>WhatsApp</a>
            </div>
          </nav>

          <div className="detail-hero__content">
            <p className={`status-pill status-pill--${detailProperty.category}`}>
              {CATEGORY_META[detailProperty.category]?.label || "En venta"}
            </p>
            <h1>{detailProperty.title}</h1>
            <p className="detail-hero__location">{detailProperty.location}</p>
            <div className="detail-hero__actions">
              <button type="button" className="map-btn" onClick={focusPropertyOnMap.bind(null, detailProperty)}>
                Ver mapa
              </button>
              <a
                href={createWhatsAppLink(detailProperty)}
                target="_blank"
                rel="noreferrer"
                className="wa-btn"
              >
                Contactar por WhatsApp
              </a>
            </div>
          </div>
        </header>

        <main className="detail-layout">
          <section className="detail-main">
            <div className="detail-panel">
              <p className="chip">Galería de fotos</p>
              <PropertyGallery property={detailProperty} />
            </div>

            <div className="detail-panel">
              <p className="chip">Descripcion completa</p>
              <div className="rich-text detail-description">
                {detailProperty.descriptionLines?.length ? (
                  detailProperty.descriptionLines.map((line, index) => (
                    <p
                      key={`${detailProperty.id}-detail-${index}`}
                      className={index === 0 ? "description-line description-line--lead" : "description-line"}
                    >
                      {line}
                    </p>
                  ))
                ) : (
                  <p className="description-line">Sin descripcion disponible.</p>
                )}
              </div>
            </div>
          </section>

          <aside className="detail-aside">
            <div className="detail-panel detail-summary">
              <p className="chip">Ficha completa</p>
              <h2>{detailProperty.title}</h2>
              <p>{detailProperty.location}</p>
              <div className="detail-stats">
                <div>
                  <span>Precio</span>
                  <strong>{formatDisplayedPrice(detailProperty)}</strong>
                </div>
                <div>
                  <span>Superficie</span>
                  <strong>{detailProperty.area}</strong>
                </div>
                <div>
                  <span>Geo</span>
                  <strong>{formatCoords(detailProperty.coords)}</strong>
                </div>
              </div>
              <a
                href={createWhatsAppLink(detailProperty)}
                target="_blank"
                rel="noreferrer"
                className="wa-btn wa-btn--detail"
              >
                <WhatsAppIcon />
                Consultar por WhatsApp
              </a>
            </div>

            <div className="detail-panel" id="mapa-detalle">
              <p className="chip">Mapa exclusivo</p>
              <div className="map-frame map-frame--detail">
                <PropertyMap
                  properties={[detailProperty]}
                  selectedProperty={detailProperty}
                  onSelect={() => setSelectedId(detailProperty.id)}
                  zoom={14}
                  emptyLabel="No hay ubicación para esta propiedad."
                />
              </div>
            </div>
          </aside>
        </main>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header className="hero" id="inicio">
        <nav className="top-nav">
          <BrandLogo />
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
          <h1>Conectamos al comprador con el vendedor indicado.</h1>
          <p>
            Un servicio rapido, agil y moderno, con mucho alcance para vender mejor y encontrar
            la propiedad justa. Acompañamos cada paso con atencion personalizada y foco en
            resultados.
          </p>
          <p className="hero-note">Tomemos un cafe y charlemos sobre tu proximo movimiento.</p>
          <a
            className="contact-line"
            href={`https://wa.me/${officeWhatsApp}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Abrir WhatsApp"
          >
            WhatsApp: <strong>+54 9 2944 68-8613</strong>
          </a>
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
                  onClick={() => openPropertyPage(property)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPropertyPage(property);
                    }
                  }}
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
                    <div className="summary-stack">
                      {(property.descriptionLines?.length ? property.descriptionLines : [property.summary]).slice(0, 2).map((line, index) => (
                        <p
                          key={`${property.id}-summary-${index}`}
                          className={index === 0 ? "summary-line summary-line--lead" : "summary-line"}
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                    <div className="card-actions">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openPropertyPage(property);
                        }}
                        className="map-btn"
                      >
                        Ver ficha
                      </button>
                      <a
                        href={createWhatsAppLink(property)}
                        target="_blank"
                        rel="noreferrer"
                        className="wa-btn"
                        onClick={(event) => event.stopPropagation()}
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
              <PropertyMap
                properties={visibleProperties}
                selectedProperty={selectedProperty}
                onSelect={(property) => setSelectedId(property.id)}
              />
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
              <div className="rich-text">
                {selectedProperty?.descriptionLines?.length ? (
                  selectedProperty.descriptionLines.map((line, index) => (
                    <p
                      key={`${selectedProperty.id}-desc-${index}`}
                      className={index === 0 ? "description-line description-line--lead" : "description-line"}
                    >
                      {line}
                    </p>
                  ))
                ) : (
                  <p className="description-line">Sin descripcion disponible.</p>
                )}
              </div>
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
