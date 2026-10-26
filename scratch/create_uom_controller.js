const fs = require('fs');

const controllerCode = `using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Onion.Controllers
{
    public class UnitOfMeasurementDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Symbol { get; set; } = string.Empty;
        public bool AllowsDecimals { get; set; }
        public string Description { get; set; } = string.Empty;
        public int? CompanyId { get; set; }
    }

    [Route("unitofmeasurement")]
    [Route("v1/unitofmeasurement")]
    [ApiController]
    public class UnitOfMeasurementController : ControllerBase
    {
        private static readonly List<UnitOfMeasurementDto> _units = new()
        {
            new UnitOfMeasurementDto { Id = 1, Name = "Unidad", Symbol = "und", AllowsDecimals = false, Description = "Unidad básica individual" },
            new UnitOfMeasurementDto { Id = 2, Name = "Libra", Symbol = "lb", AllowsDecimals = true, Description = "Libra (peso)" },
            new UnitOfMeasurementDto { Id = 3, Name = "Kilogramo", Symbol = "kg", AllowsDecimals = true, Description = "Kilogramo (peso)" },
            new UnitOfMeasurementDto { Id = 4, Name = "Onza", Symbol = "oz", AllowsDecimals = true, Description = "Onza" },
            new UnitOfMeasurementDto { Id = 5, Name = "Gramo", Symbol = "g", AllowsDecimals = true, Description = "Gramo" },
            new UnitOfMeasurementDto { Id = 6, Name = "Litro", Symbol = "l", AllowsDecimals = true, Description = "Litro (volumen)" },
            new UnitOfMeasurementDto { Id = 7, Name = "Galón", Symbol = "gal", AllowsDecimals = true, Description = "Galón (volumen)" },
            new UnitOfMeasurementDto { Id = 8, Name = "Metro", Symbol = "m", AllowsDecimals = true, Description = "Metro lineal" },
            new UnitOfMeasurementDto { Id = 9, Name = "Paquete", Symbol = "paq", AllowsDecimals = false, Description = "Paquete" },
            new UnitOfMeasurementDto { Id = 10, Name = "Caja", Symbol = "caja", AllowsDecimals = false, Description = "Caja" }
        };

        [HttpGet]
        public IActionResult GetAll()
        {
            return Ok(Onion.Common.Models.ApiResponse<List<UnitOfMeasurementDto>>.Ok(_units));
        }

        [HttpGet("{id}")]
        public IActionResult GetById(int id)
        {
            var unit = _units.FirstOrDefault(u => u.Id == id);
            if (unit == null) return NotFound(Onion.Common.Models.ApiResponse<object>.Fail("Unidad no encontrada"));
            return Ok(Onion.Common.Models.ApiResponse<UnitOfMeasurementDto>.Ok(unit));
        }

        [HttpPost]
        public IActionResult Create([FromBody] UnitOfMeasurementDto dto)
        {
            var nextId = _units.Count > 0 ? _units.Max(u => u.Id) + 1 : 1;
            dto.Id = nextId;
            _units.Add(dto);
            return Ok(Onion.Common.Models.ApiResponse<UnitOfMeasurementDto>.Ok(dto, "Unidad creada"));
        }

        [HttpPut("{id}")]
        public IActionResult Update(int id, [FromBody] UnitOfMeasurementDto dto)
        {
            var existing = _units.FirstOrDefault(u => u.Id == id);
            if (existing == null) return NotFound(Onion.Common.Models.ApiResponse<object>.Fail("Unidad no encontrada"));
            existing.Name = dto.Name;
            existing.Symbol = dto.Symbol;
            existing.AllowsDecimals = dto.AllowsDecimals;
            existing.Description = dto.Description;
            return Ok(Onion.Common.Models.ApiResponse<UnitOfMeasurementDto>.Ok(existing, "Unidad actualizada"));
        }

        [HttpDelete("{id}")]
        public IActionResult Delete(int id)
        {
            var existing = _units.FirstOrDefault(u => u.Id == id);
            if (existing != null) _units.Remove(existing);
            return Ok(Onion.Common.Models.ApiResponse<bool>.Ok(true, "Unidad eliminada"));
        }
    }
}
`;

fs.writeFileSync('C:/Users/pelie/source/repos/MyDev/cuadreEnv/api/crud-onion/Controllers/UnitOfMeasurementController.cs', controllerCode, 'utf8');
console.log('UnitOfMeasurementController.cs created successfully.');
