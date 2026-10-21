-- Tabellen der Bedienungsanleitung über die ganze Breite, alle Spalten gleich breit (wie bisher in Word)
function Table(t)
  for i, c in ipairs(t.colspecs) do
    t.colspecs[i] = { c[1], 1 / #t.colspecs }
  end
  return t
end
